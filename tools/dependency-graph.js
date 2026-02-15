#!/usr/bin/env node
/**
 * Static dependency analysis for JavaScript codebases.
 *
 * Two modes:
 *   Client mode (default): Scans for global singleton objects (const PascalName = { ... })
 *   Server mode (--server): Scans for CommonJS require() statements
 *
 * Usage:
 *   node tools/dependency-graph.js <dir>                    # Client: Mermaid
 *   node tools/dependency-graph.js <dir> --report           # Client: Markdown report
 *   node tools/dependency-graph.js <dir> --server           # Server: Mermaid
 *   node tools/dependency-graph.js <dir> --server --report  # Server: Markdown report
 *   node tools/dependency-graph.js <dir> --stats            # Statistics
 *   node tools/dependency-graph.js <dir> --json             # JSON adjacency list
 *
 * Example:
 *   node tools/dependency-graph.js app/static/rap
 *   node tools/dependency-graph.js app/server --server
 */

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Shared: Collect JS files recursively
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
    const re = /^(?:  )?const\s+([A-Z][A-Za-z]+)\s*=\s*\{/gm;
    let m;
    while ((m = re.exec(src)) !== null) {
      globals.push({ name: m[1], file: path.relative(dir, file) });
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
    // Use filename without .js as module name; collapse index.js to dir name
    let name = rel.replace(/\.js$/, '');
    if (name.endsWith('/index')) {
      name = name.replace(/\/index$/, '');
    }
    modules.push({ name, file: rel });
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

function buildServerGraph(dir, modules) {
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
        // Check if it's a sibling directory (shared/, static/)
        const appDir = path.resolve(dir, '..');
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
    modules.push({ name: ext, file: relFile });
  }

  return edges;
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
      lines.push(`    ${nodeId(g.name)}["${shortLabel}"]`);
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
    const bar = '\u2588'.repeat(count);
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
    const bar = '\u2588'.repeat(count);
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
  lines.push('## Dependency Graph');
  lines.push('');
  lines.push('```mermaid');
  lines.push(toMermaid(modules, edges));
  lines.push('```');
  lines.push('');

  // Top outgoing
  const outgoing = modules
    .map(g => ({ name: g.name, count: (edges[g.name] || new Set()).size }))
    .sort((a, b) => b.count - a.count)
    .filter(g => g.count > 0);

  lines.push('## Most Dependencies (outgoing)');
  lines.push('');
  lines.push('| Module | Count |');
  lines.push('|--------|------:|');
  for (const { name, count } of outgoing.slice(0, 10)) {
    lines.push(`| ${name} | ${count} |`);
  }
  lines.push('');

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
  lines.push('| Module | Count |');
  lines.push('|--------|------:|');
  for (const [name, count] of inSorted.slice(0, 10)) {
    lines.push(`| ${name} | ${count} |`);
  }
  lines.push('');

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
// Main
// ============================================================================

const args = process.argv.slice(2);
const flags = args.filter(a => a.startsWith('--'));
const positional = args.filter(a => !a.startsWith('--'));

if (positional.length === 0) {
  console.error('Usage: node tools/dependency-graph.js <dir> [--server] [--stats|--json|--report]');
  console.error('  <dir>     Directory to scan');
  console.error('  --server  CommonJS require() analysis (default: client global singletons)');
  process.exit(1);
}

const scanDir = path.resolve(positional[0]);
if (!fs.existsSync(scanDir)) {
  console.error(`Directory not found: ${scanDir}`);
  process.exit(1);
}

const serverMode = flags.includes('--server');
let modules, edges, reportTitle;

if (serverMode) {
  modules = discoverServerModules(scanDir);
  edges = buildServerGraph(scanDir, modules);
  reportTitle = 'Server-Side Dependency Map';
} else {
  modules = discoverGlobals(scanDir);
  edges = buildClientGraph(scanDir, modules);
  reportTitle = 'Client-Side Dependency Map';
}

if (flags.includes('--json')) {
  const obj = {};
  for (const [k, v] of Object.entries(edges)) {
    if (v.size > 0) obj[k] = [...v].sort();
  }
  console.log(JSON.stringify(obj, null, 2));
} else if (flags.includes('--report')) {
  console.log(toReport(modules, edges, reportTitle));
} else if (flags.includes('--stats')) {
  console.log(toStats(modules, edges));
} else {
  console.log(toMermaid(modules, edges));
}
