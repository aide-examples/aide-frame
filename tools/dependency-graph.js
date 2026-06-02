#!/usr/bin/env node
/**
 * Static dependency analysis for JavaScript codebases.
 *
 * Modes:
 *   Client (default)       Scans for global singleton objects (const PascalName = { ... })
 *   --server               CommonJS require() analysis
 *   --boundary             (server-mode only) Classify each require-edge in four
 *                          classes: internal | appLocal | crossBoundary | npmOrAbsolute.
 *                          crossBoundary edges are VIOLATIONS (system→framework).
 *                          Exit code 1 if any crossBoundary edges found.
 *   --reverse-check        Stand-alone mode (no --server, no --boundary). Scans
 *                          a framework directory for require()-strings that
 *                          reference 'systems/' — those are Framework→System
 *                          violations. Exit code 1 if any found.
 *
 * Output flags:
 *   --report               Markdown report (default for --boundary / --reverse-check)
 *   --stats                Text statistics
 *   --json                 JSON adjacency list
 *   (none)                 Mermaid graph (default for client / server modes)
 *
 * Path flags:
 *   --app-dir <path>       Override appDir (default: path.resolve(scanDir, '..')).
 *                          For per-system scans the caller should set
 *                          --app-dir=<systemDir> so "outside scanDir, inside appDir"
 *                          correctly means "within the same system".
 *   --project-root <path>  Override projectRoot for cross-boundary classification
 *                          (default: path.resolve(appDir, '..')). crossBoundary
 *                          edges are those that escape appDir but stay inside
 *                          projectRoot.
 *   --output <file>        Write output to file instead of stdout. Required for
 *                          callers that use execSync (Node's execSync discards
 *                          stdout when the child exits with non-zero — and the
 *                          boundary / reverse-check modes exit 1 on violations).
 *
 * Usage:
 *   node tools/dependency-graph.js <dir>                                # Client: Mermaid
 *   node tools/dependency-graph.js <dir> --report                       # Client: Markdown
 *   node tools/dependency-graph.js <dir> --server --report              # Server: Markdown
 *   node tools/dependency-graph.js <dir> --server --boundary \
 *        --app-dir <systemDir> --project-root <projectRoot> \
 *        --output <systemDir>/docs/reports/boundary-access.md           # Boundary report
 *   node tools/dependency-graph.js <frameworkServerDir> --reverse-check \
 *        --output <projectRoot>/app/docs/developer/framework-boundary-audit.md
 */

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Argument parser — supports `--flag` and `--flag value`
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const flags = new Set();
  const values = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const name = a.slice(2);
      const next = argv[i + 1];
      // Treat as value-flag iff next token exists and is not another flag.
      // For known value-flag names we require the value.
      const valueFlagNames = new Set(['app-dir', 'project-root', 'output']);
      if (valueFlagNames.has(name)) {
        if (!next || next.startsWith('--')) {
          console.error(`Flag --${name} requires a value`);
          process.exit(1);
        }
        values[name] = next;
        i++;
      } else {
        flags.add(name);
      }
    } else {
      positional.push(a);
    }
  }
  return { flags, values, positional };
}

// ---------------------------------------------------------------------------
// Shared: collect JS files recursively
// ---------------------------------------------------------------------------

function collectJsFiles(dir) {
  const result = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules') {
      result.push(...collectJsFiles(full));
    } else if (entry.name.endsWith('.js')) {
      result.push(full);
    }
  }
  return result;
}

function isReferenced(name, edges) {
  for (const targets of Object.values(edges)) {
    if (targets.has(name)) return true;
  }
  return false;
}

// ============================================================================
// CLIENT MODE: Global singleton analysis
// ============================================================================

function discoverGlobals(dir) {
  const globals = [];
  const files = collectJsFiles(dir);
  for (const file of files) {
    const src = fs.readFileSync(file, 'utf8');
    const loc = src.split('\n').length;
    // Singleton globals can be declared as `var Name = {` (the aide-rap convention)
    // or `const Name = {` (newer files). `let` is allowed for symmetry even though
    // it's rare for module-level singletons. Names are PascalCase and may include
    // digits (e.g. UTF8Decoder).
    const re = /^(?:  )?(?:var|const|let)\s+([A-Z][A-Za-z0-9]+)\s*=\s*\{/gm;
    let m;
    while ((m = re.exec(src)) !== null) {
      globals.push({ name: m[1], file: path.relative(dir, file), loc, kind: 'singleton' });
    }
    // ES6 class declarations — pattern used widely in aide-bridge (IIFE-wrapped
    // class ViewName { ... }). Indentation up to 2 spaces tolerated (class
    // typically lives at top level even inside an IIFE). `export class` covered
    // for systems that adopt ES-modules later.
    const classRe = /^(?:  )?(?:export\s+)?class\s+([A-Z][A-Za-z0-9_]+)/gm;
    while ((m = classRe.exec(src)) !== null) {
      globals.push({ name: m[1], file: path.relative(dir, file), loc, kind: 'class' });
    }
  }
  return globals;
}

function stripNoise(src) {
  src = src.replace(/\/\/.*$/gm, '');
  src = src.replace(/\/\*[\s\S]*?\*\//g, '');
  src = src.replace(/`[^`]*`/g, (m) => ' '.repeat(m.length));
  src = src.replace(/'[^']*'/g, (m) => ' '.repeat(m.length));
  src = src.replace(/"[^"]*"/g, (m) => ' '.repeat(m.length));
  return src;
}

function buildClientGraph(dir, globals) {
  const names = globals.map(g => g.name);
  const fileToGlobals = {};
  for (const g of globals) {
    if (!fileToGlobals[g.file]) fileToGlobals[g.file] = [];
    fileToGlobals[g.file].push(g.name);
  }

  const edges = {};
  for (const name of names) edges[name] = new Set();

  const files = collectJsFiles(dir);
  for (const file of files) {
    const relFile = path.relative(dir, file);
    const definedHere = fileToGlobals[relFile] || [];
    const src = stripNoise(fs.readFileSync(file, 'utf8'));

    for (const target of names) {
      if (definedHere.includes(target)) continue;
      const re = new RegExp(`\\b${target}\\b`, 'g');
      if (re.test(src)) {
        for (const source of definedHere) {
          edges[source].add(target);
        }
      }
    }
  }

  return edges;
}

// ============================================================================
// SERVER MODE: CommonJS require() analysis
// ============================================================================

function discoverServerModules(dir) {
  const modules = [];
  const files = collectJsFiles(dir);
  for (const file of files) {
    const rel = path.relative(dir, file);
    const loc = fs.readFileSync(file, 'utf8').split('\n').length;
    // Use filename without .js as module name; collapse index.js to dir name
    let name = rel.replace(/\.js$/, '');
    if (name.endsWith('/index')) {
      name = name.replace(/\/index$/, '');
    }
    modules.push({ name, file: rel, loc });
  }
  return modules;
}

function resolveRequire(requirePath, sourceFile, scanDir) {
  const sourceDir = path.dirname(path.join(scanDir, sourceFile));
  let resolved = path.resolve(sourceDir, requirePath);

  // Try direct .js
  if (fs.existsSync(resolved + '.js')) {
    return path.relative(scanDir, resolved + '.js');
  }
  // Try directory/index.js
  if (fs.existsSync(path.join(resolved, 'index.js'))) {
    return path.relative(scanDir, path.join(resolved, 'index.js'));
  }
  // Try exact file (already has extension)
  if (fs.existsSync(resolved)) {
    return path.relative(scanDir, resolved);
  }
  return null;
}

function buildServerGraph(dir, modules, appDir) {
  const moduleByFile = {};
  for (const m of modules) {
    moduleByFile[m.file] = m.name;
  }

  const edges = {};
  for (const m of modules) edges[m.name] = new Set();

  // Also track external modules (outside scan dir) that get referenced
  const externalModules = new Set();

  for (const m of modules) {
    const filePath = path.join(dir, m.file);
    const src = fs.readFileSync(filePath, 'utf8');

    // Match require('./...') and require('../...')
    const re = /require\(\s*['"](\.[^'"]+)['"]\s*\)/g;
    let match;
    while ((match = re.exec(src)) !== null) {
      const reqPath = match[1];
      const resolved = resolveRequire(reqPath, m.file, dir);

      if (resolved) {
        const targetName = moduleByFile[resolved];
        if (targetName && targetName !== m.name) {
          edges[m.name].add(targetName);
        }
      } else {
        // Require points outside scan dir — resolve for display
        const sourceDir = path.dirname(path.join(dir, m.file));
        const absTarget = path.resolve(sourceDir, reqPath);
        // Check if it's still inside the appDir (sibling directory)
        if (absTarget.startsWith(appDir)) {
          let extName = path.relative(appDir, absTarget).replace(/\.js$/, '');
          if (fs.existsSync(absTarget + '.js') || fs.existsSync(absTarget)) {
            if (!edges[extName]) {
              edges[extName] = new Set();
              externalModules.add(extName);
            }
            edges[m.name].add(extName);
          }
        }
      }
    }
  }

  // Add external modules to the modules list for display
  for (const ext of externalModules) {
    const relFile = ext + '.js';
    const absFile = path.join(appDir, relFile);
    let loc = 0;
    try { loc = fs.readFileSync(absFile, 'utf8').split('\n').length; } catch (e) { /* ignore */ }
    modules.push({ name: ext, file: relFile, loc });
  }

  return edges;
}

// ============================================================================
// BOUNDARY MODE: classify each require-edge in four classes.
//
// internal     : target resolves inside scanDir
// appLocal     : target resolves outside scanDir but inside appDir
//                (e.g. system server-code requiring system tools/ — legitimate)
// crossBoundary: target resolves outside appDir but inside projectRoot
//                (e.g. system server-code requiring app/server/utils — VIOLATION)
// npmOrAbsolute: not a relative require (./|../) — ignored by the regex
//                (path/fs/express/etc. don't appear as edges)
// ============================================================================

function analyzeBoundary(scanDir, modules, appDir, projectRoot) {
  const moduleByFile = {};
  for (const m of modules) moduleByFile[m.file] = m.name;

  const classes = {
    internal: [],
    appLocal: [],
    crossBoundary: [],
  };

  for (const m of modules) {
    const filePath = path.join(scanDir, m.file);
    const src = fs.readFileSync(filePath, 'utf8');
    const lines = src.split('\n');

    // Match require('./...') and require('../...')
    // We re-scan per line so we can report line numbers.
    for (let i = 0; i < lines.length; i++) {
      const lineRe = /require\(\s*['"](\.[^'"]+)['"]\s*\)/g;
      let match;
      while ((match = lineRe.exec(lines[i])) !== null) {
        const reqPath = match[1];
        const sourceDir = path.dirname(filePath);
        let absTarget = path.resolve(sourceDir, reqPath);

        // Try common resolution suffixes to find the real on-disk target
        let resolvedAbs = null;
        if (fs.existsSync(absTarget + '.js')) resolvedAbs = absTarget + '.js';
        else if (fs.existsSync(path.join(absTarget, 'index.js'))) resolvedAbs = path.join(absTarget, 'index.js');
        else if (fs.existsSync(absTarget)) resolvedAbs = absTarget;
        // If unresolved, we still classify by intended target (absTarget without suffix)

        const targetForClass = resolvedAbs || absTarget;
        const entry = {
          sourceFile: m.file,
          sourceModule: m.name,
          line: i + 1,
          requirePath: reqPath,
          resolvedPath: resolvedAbs ? path.relative(projectRoot, resolvedAbs) : null,
          unresolvedAbsTarget: resolvedAbs ? null : absTarget,
        };

        if (targetForClass.startsWith(scanDir + path.sep) || targetForClass === scanDir) {
          classes.internal.push(entry);
        } else if (targetForClass.startsWith(appDir + path.sep) || targetForClass === appDir) {
          classes.appLocal.push(entry);
        } else if (targetForClass.startsWith(projectRoot + path.sep) || targetForClass === projectRoot) {
          classes.crossBoundary.push(entry);
        }
        // else: outside projectRoot — unusual, e.g. someone require('../../../other-repo/...');
        //       we report it as crossBoundary too, since it definitely escapes the system.
        else if (reqPath.startsWith('../')) {
          classes.crossBoundary.push(entry);
        }
      }
    }
  }

  return classes;
}

function toBoundaryReport(classes, scanDir, appDir, projectRoot) {
  const lines = [];
  const date = new Date().toISOString().slice(0, 10);
  const systemLabel = path.basename(appDir);

  lines.push(`# Boundary Access Report — ${systemLabel}`);
  lines.push('');
  lines.push(`Cross-boundary \`require()\` edges from this system into the framework.`);
  lines.push('');
  lines.push(`*Generated: ${date} by \`dependency-graph.js --boundary\`*`);
  lines.push('');
  lines.push(`- **scanDir:** \`${path.relative(projectRoot, scanDir) || '.'}\``);
  lines.push(`- **appDir:** \`${path.relative(projectRoot, appDir) || '.'}\``);
  lines.push(`- **projectRoot:** \`${projectRoot}\``);
  lines.push('');

  lines.push('## Summary');
  lines.push('');
  lines.push('| Edge Class | Count | Status |');
  lines.push('|------------|------:|:------:|');
  lines.push(`| Internal (inside scanDir) | ${classes.internal.length} | OK |`);
  lines.push(`| App-Local (inside appDir, outside scanDir) | ${classes.appLocal.length} | OK |`);
  lines.push(`| **Cross-Boundary (escapes appDir)** | **${classes.crossBoundary.length}** | ${classes.crossBoundary.length > 0 ? '**VIOLATION**' : 'OK'} |`);
  lines.push('');

  if (classes.crossBoundary.length > 0) {
    lines.push('## Cross-Boundary Edges (System → Framework)');
    lines.push('');
    lines.push('System code must access the framework only via the DI bag injected at mount time (`theDb`, `theLogger`, `theLiveService`, `theMediaService`, `authMiddleware`, `requireRole`, …). Direct `require()` of framework internals violates the mandatory boundary (see aide-rap CLAUDE.md → "Mandantenfähigkeit").');
    lines.push('');
    lines.push('| Source File | Line | require() | Resolved Target |');
    lines.push('|-------------|-----:|-----------|-----------------|');
    for (const e of classes.crossBoundary) {
      const target = e.resolvedPath || `*unresolved* (${e.unresolvedAbsTarget})`;
      lines.push(`| \`${e.sourceFile}\` | ${e.line} | \`${e.requirePath}\` | \`${target}\` |`);
    }
    lines.push('');
    lines.push('## Recommendation');
    lines.push('');
    lines.push('For each violation above, refactor the source file to receive the needed service through the DI bag (passed via `registerSystemRoutes(app, depBag)`) instead of `require`-ing the framework module directly.');
    lines.push('');
  } else {
    lines.push('## Assessment');
    lines.push('');
    lines.push('**Clean.** System code respects the framework boundary — no direct `require()` edges escape `appDir`.');
    lines.push('');
  }

  if (classes.appLocal.length > 0) {
    lines.push('## App-Local Edges (informational)');
    lines.push('');
    lines.push(`${classes.appLocal.length} edge(s) leave \`scanDir\` but stay inside \`appDir\` — typically system server-code referencing system \`tools/\` or shared system modules. These are legitimate.`);
    lines.push('');
    const sampleSize = Math.min(10, classes.appLocal.length);
    if (sampleSize > 0) {
      lines.push('| Source File | Line | require() | Resolved Target |');
      lines.push('|-------------|-----:|-----------|-----------------|');
      for (const e of classes.appLocal.slice(0, sampleSize)) {
        const target = e.resolvedPath || `*unresolved*`;
        lines.push(`| \`${e.sourceFile}\` | ${e.line} | \`${e.requirePath}\` | \`${target}\` |`);
      }
      if (classes.appLocal.length > sampleSize) {
        lines.push(`| … | … | … | (${classes.appLocal.length - sampleSize} more) |`);
      }
      lines.push('');
    }
  }

  lines.push('---');
  lines.push('');
  lines.push('*Generated with `tools/dependency-graph.js` from aide-frame.*');

  return lines.join('\n');
}

// ============================================================================
// REVERSE-CHECK MODE: Framework → System violations.
//
// Framework code must NEVER `require('./systems/...')` or any path that
// references a specific system. The framework is system-agnostic by contract
// (CLAUDE.md "Mandantenfähigkeit"); system-mounting happens via dynamic path
// construction (`path.join(systemDir, 'server', 'routes.js')`), which is
// invisible to the static regex.
//
// We scan scanDir's JS files for any `require()` whose string-literal argument
// contains '/systems/' or '\\systems\\'. Hits are violations.
// ============================================================================

function analyzeReverseBoundary(scanDir) {
  const violations = [];
  const files = collectJsFiles(scanDir);
  for (const file of files) {
    const src = fs.readFileSync(file, 'utf8');
    const lines = src.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const lineRe = /require\(\s*['"]([^'"]+)['"]\s*\)/g;
      let m;
      while ((m = lineRe.exec(lines[i])) !== null) {
        const reqPath = m[1];
        if (reqPath.includes('/systems/') || reqPath.includes('\\systems\\')) {
          violations.push({
            sourceFile: path.relative(scanDir, file),
            line: i + 1,
            requirePath: reqPath,
          });
        }
      }
    }
  }
  return violations;
}

function toReverseBoundaryReport(violations, scanDir) {
  const lines = [];
  const date = new Date().toISOString().slice(0, 10);

  lines.push(`# Framework Boundary Audit (Reverse-Check)`);
  lines.push('');
  lines.push('Framework code must never `require()` a path that references a specific system. Mounting happens via dynamic path construction in `app/server/index.js`, which is invisible to the regex below.');
  lines.push('');
  lines.push(`*Generated: ${date} by \`dependency-graph.js --reverse-check\`*`);
  lines.push('');
  lines.push(`- **scanDir:** \`${scanDir}\``);
  lines.push('');

  lines.push('## Summary');
  lines.push('');
  lines.push('| Violation Count | Status |');
  lines.push('|----------------:|:------:|');
  lines.push(`| ${violations.length} | ${violations.length > 0 ? '**VIOLATION**' : 'OK'} |`);
  lines.push('');

  if (violations.length > 0) {
    lines.push('## Violations');
    lines.push('');
    lines.push('| Source File | Line | require() |');
    lines.push('|-------------|-----:|-----------|');
    for (const v of violations) {
      lines.push(`| \`${v.sourceFile}\` | ${v.line} | \`${v.requirePath}\` |`);
    }
    lines.push('');
  } else {
    lines.push('## Assessment');
    lines.push('');
    lines.push('**Clean.** Framework code contains no string-literal `require()` referencing any system directory.');
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push('*Generated with `tools/dependency-graph.js --reverse-check` from aide-frame.*');

  return lines.join('\n');
}

// ============================================================================
// OUTPUT: Mermaid
// ============================================================================

function toMermaid(modules, edges) {
  const lines = ['graph LR'];

  const active = modules.filter(g =>
    edges[g.name]?.size > 0 || isReferenced(g.name, edges)
  );

  // Group by directory for subgraphs
  const byDir = {};
  for (const g of active) {
    const dir = path.dirname(g.file);
    if (!byDir[dir]) byDir[dir] = [];
    byDir[dir].push(g);
  }

  // Node IDs get "n_" prefix to avoid collision with subgraph IDs
  // (e.g. module "middleware" from index.js inside subgraph "middleware")
  const nodeId = (name) => 'n_' + name.replace(/[^a-zA-Z0-9]/g, '_');

  for (const [dir, members] of Object.entries(byDir)) {
    const label = dir === '.' ? 'root' : dir.replace(/\//g, ' / ');
    const safeId = 'sg_' + dir.replace(/[^a-zA-Z0-9]/g, '_');
    lines.push(`  subgraph ${safeId}["${label}"]`);
    for (const g of members) {
      const shortLabel = path.basename(g.name);
      const kindMarker = g.kind === 'class' ? ' (C)' : '';
      const locSuffix = g.loc ? ` &nbsp; ${g.loc}` : '';
      lines.push(`    ${nodeId(g.name)}["${shortLabel}${kindMarker}${locSuffix}"]`);
    }
    lines.push('  end');
  }

  lines.push('');

  for (const g of active) {
    const sorted = [...(edges[g.name] || [])].sort();
    for (const target of sorted) {
      lines.push(`  ${nodeId(g.name)} --> ${nodeId(target)}`);
    }
  }

  const isolated = modules.filter(g =>
    (!edges[g.name] || edges[g.name].size === 0) && !isReferenced(g.name, edges)
  );
  if (isolated.length > 0) {
    lines.push('');
    lines.push(`  %% Isolated: ${isolated.map(g => g.name).join(', ')}`);
  }

  return lines.join('\n');
}

// ============================================================================
// OUTPUT: Stats
// ============================================================================

function toStats(modules, edges) {
  const lines = [];
  lines.push(`=== Dependency Statistics (${modules.length} modules) ===\n`);

  const outgoing = modules
    .map(g => ({ name: g.name, count: (edges[g.name] || new Set()).size }))
    .sort((a, b) => b.count - a.count);

  lines.push('Uses others (outgoing):');
  for (const { name, count } of outgoing) {
    const bar = '█'.repeat(count);
    lines.push(`  ${name.padEnd(30)} ${String(count).padStart(2)}  ${bar}`);
  }

  lines.push('\nUsed by others (incoming):');
  const incoming = {};
  for (const g of modules) incoming[g.name] = 0;
  for (const targets of Object.values(edges)) {
    for (const t of targets) {
      if (incoming[t] !== undefined) incoming[t]++;
    }
  }
  const inSorted = Object.entries(incoming).sort((a, b) => b[1] - a[1]);
  for (const [name, count] of inSorted) {
    const bar = '█'.repeat(count);
    lines.push(`  ${name.padEnd(30)} ${String(count).padStart(2)}  ${bar}`);
  }

  const isolated = modules.filter(g =>
    (!edges[g.name] || edges[g.name].size === 0) && !isReferenced(g.name, edges)
  );
  if (isolated.length > 0) {
    lines.push(`\nIsolated: ${isolated.map(g => g.name).join(', ')}`);
  }

  lines.push('\nMutual dependencies (A<->B):');
  const seen = new Set();
  let mutualCount = 0;
  for (const [a, targets] of Object.entries(edges)) {
    for (const b of targets) {
      if (edges[b]?.has(a) && !seen.has(`${b}-${a}`)) {
        seen.add(`${a}-${b}`);
        lines.push(`  ${a} <-> ${b}`);
        mutualCount++;
      }
    }
  }
  if (mutualCount === 0) lines.push('  (none)');

  return lines.join('\n');
}

// ============================================================================
// OUTPUT: Markdown Report (--report)
// ============================================================================

function toReport(modules, edges, title) {
  const lines = [];
  const date = new Date().toISOString().slice(0, 10);

  lines.push(`# ${title}`);
  lines.push('');
  lines.push(`Static analysis of ${modules.length} modules and their cross-references.`);
  lines.push('');
  lines.push(`*Generated: ${date}*`);
  lines.push('');

  if (modules.length === 0) {
    lines.push('## Assessment');
    lines.push('');
    lines.push('No modules found in the scan directory. The directory may be empty, or the analysis style (global singletons / CommonJS require()) does not apply to this codebase.');
    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push('*Generated with `tools/dependency-graph.js` from aide-frame.*');
    return lines.join('\n');
  }

  lines.push('## Dependency Graph');
  lines.push('');
  lines.push('```mermaid');
  lines.push(toMermaid(modules, edges));
  lines.push('```');
  lines.push('');

  // Build LOC lookup
  const locByName = {};
  for (const g of modules) locByName[g.name] = g.loc || '';

  // Top outgoing
  const outgoing = modules
    .map(g => ({ name: g.name, count: (edges[g.name] || new Set()).size }))
    .sort((a, b) => b.count - a.count)
    .filter(g => g.count > 0);

  lines.push('## Most Dependencies (outgoing)');
  lines.push('');
  if (outgoing.length === 0) {
    lines.push('*(no outgoing edges)*');
    lines.push('');
  } else {
    lines.push('| Module | LOC | Count |');
    lines.push('|--------|----:|------:|');
    for (const { name, count } of outgoing.slice(0, 10)) {
      lines.push(`| ${name} | ${locByName[name]} | ${count} |`);
    }
    lines.push('');
  }

  // Top incoming
  const incoming = {};
  for (const g of modules) incoming[g.name] = 0;
  for (const targets of Object.values(edges)) {
    for (const t of targets) {
      if (incoming[t] !== undefined) incoming[t]++;
    }
  }
  const inSorted = Object.entries(incoming)
    .sort((a, b) => b[1] - a[1])
    .filter(([, c]) => c > 0);

  lines.push('## Most Used (incoming)');
  lines.push('');
  if (inSorted.length === 0) {
    lines.push('*(no incoming edges)*');
    lines.push('');
  } else {
    lines.push('| Module | LOC | Count |');
    lines.push('|--------|----:|------:|');
    for (const [name, count] of inSorted.slice(0, 10)) {
      lines.push(`| ${name} | ${locByName[name]} | ${count} |`);
    }
    lines.push('');
  }

  // Mutual dependencies
  const mutuals = [];
  const seen = new Set();
  for (const [a, targets] of Object.entries(edges)) {
    for (const b of targets) {
      if (edges[b]?.has(a) && !seen.has(`${b}-${a}`)) {
        seen.add(`${a}-${b}`);
        mutuals.push([a, b]);
      }
    }
  }

  if (mutuals.length > 0) {
    lines.push('## Mutual Dependencies');
    lines.push('');
    lines.push('| Pair |');
    lines.push('|------|');
    for (const [a, b] of mutuals) {
      lines.push(`| ${a} <-> ${b} |`);
    }
    lines.push('');
  }

  // Isolated
  const isolated = modules.filter(g =>
    (!edges[g.name] || edges[g.name].size === 0) && !isReferenced(g.name, edges)
  );
  if (isolated.length > 0) {
    lines.push(`**Isolated:** ${isolated.map(g => g.name).join(', ')}`);
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push('*Generated with `tools/dependency-graph.js` from aide-frame.*');

  return lines.join('\n');
}

// ============================================================================
// Output sink — write to --output file if set, else stdout
// ============================================================================

function emit(text, outputFile) {
  if (outputFile) {
    fs.mkdirSync(path.dirname(outputFile), { recursive: true });
    fs.writeFileSync(outputFile, text);
  } else {
    console.log(text);
  }
}

// ============================================================================
// Main
// ============================================================================

const { flags, values, positional } = parseArgs(process.argv.slice(2));

if (positional.length === 0) {
  console.error('Usage: node tools/dependency-graph.js <dir> [--server] [--stats|--json|--report]');
  console.error('  <dir>             Directory to scan');
  console.error('  --server          CommonJS require() analysis (default: client global singletons)');
  console.error('  --boundary        (server-mode) Classify each require-edge; exit 1 on cross-boundary');
  console.error('  --reverse-check   Stand-alone Framework→System scan; exit 1 on violations');
  console.error('  --app-dir <path>  Override appDir (default: parent of scanDir)');
  console.error('  --project-root <path>  Override projectRoot (default: parent of appDir)');
  console.error('  --output <file>   Write to file instead of stdout');
  process.exit(1);
}

const scanDir = path.resolve(positional[0]);
if (!fs.existsSync(scanDir)) {
  console.error(`Directory not found: ${scanDir}`);
  process.exit(1);
}

const appDir = values['app-dir'] ? path.resolve(values['app-dir']) : path.resolve(scanDir, '..');
const projectRoot = values['project-root'] ? path.resolve(values['project-root']) : path.resolve(appDir, '..');
const outputFile = values['output'] || null;

const serverMode = flags.has('server');
const boundaryMode = flags.has('boundary');
const reverseCheckMode = flags.has('reverse-check');

if (boundaryMode && !serverMode) {
  console.error('--boundary requires --server');
  process.exit(1);
}
if (boundaryMode && reverseCheckMode) {
  console.error('--boundary and --reverse-check are mutually exclusive');
  process.exit(1);
}

// ----- Reverse-check (Framework→System) -----
if (reverseCheckMode) {
  const violations = analyzeReverseBoundary(scanDir);
  const report = toReverseBoundaryReport(violations, scanDir);
  emit(report, outputFile);
  process.exit(violations.length > 0 ? 1 : 0);
}

// ----- Boundary (System→Framework) -----
if (boundaryMode) {
  const modules = discoverServerModules(scanDir);
  const classes = analyzeBoundary(scanDir, modules, appDir, projectRoot);
  const report = toBoundaryReport(classes, scanDir, appDir, projectRoot);
  emit(report, outputFile);
  process.exit(classes.crossBoundary.length > 0 ? 1 : 0);
}

// ----- Regular client / server dependency graph -----
let modules, edges, reportTitle;

if (serverMode) {
  modules = discoverServerModules(scanDir);
  edges = buildServerGraph(scanDir, modules, appDir);
  reportTitle = 'Server-Side Dependency Map';
} else {
  modules = discoverGlobals(scanDir);
  edges = buildClientGraph(scanDir, modules);
  reportTitle = 'Client-Side Dependency Map';
}

if (flags.has('json')) {
  const obj = {};
  for (const [k, v] of Object.entries(edges)) {
    if (v.size > 0) obj[k] = [...v].sort();
  }
  emit(JSON.stringify(obj, null, 2), outputFile);
} else if (flags.has('report')) {
  emit(toReport(modules, edges, reportTitle), outputFile);
} else if (flags.has('stats')) {
  emit(toStats(modules, edges), outputFile);
} else {
  emit(toMermaid(modules, edges), outputFile);
}
