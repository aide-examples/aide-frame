"""
Generic documentation/help viewer for markdown files.

Provides functions to list, load, and structure markdown documentation
from configurable directories. Used by applications for both developer
documentation (docs/) and user help (help/).

Usage:
    from aide_frame import docs_viewer

    # For a single directory (simple case)
    structure = docs_viewer.get_structure("HELP_DIR")
    content = docs_viewer.load_file("HELP_DIR", "index.md")

    # For complex multi-directory docs with sections
    structure = docs_viewer.get_docs_structure(
        docs_dir_key="DOCS_DIR",
        framework_dir_key="AIDE_FRAME_DOCS_DIR",
        section_defs=[...]
    )
"""

import os
from . import paths
from .log import logger


# =============================================================================
# STANDARD SECTION DEFINITIONS
# =============================================================================

# Standard section ordering for AIDE apps.
# Apps can use this directly or extend it for app-specific sections.
STANDARD_SECTION_DEFS = [
    (None, "Overview"),
    ("requirements", "Requirements"),
    ("platform", "Platform"),
    ("implementation", "Implementation"),
    ("deployment", "Deployment"),
    ("development", "Development"),
]


def auto_discover_sections(dir_key, include_root=True, max_depth=2, exclude=None):
    """Auto-discover section directories and create section_defs.

    Scans the docs directory for subdirectories containing .md files
    and returns a section_defs list in a standard order.

    Args:
        dir_key: Key registered with paths.register(), e.g. "DOCS_DIR"
        include_root: Whether to include root-level files as "Overview"
        max_depth: Maximum directory depth to scan (1=immediate subdirs, 2=also nested)
        exclude: List of directory names to exclude (e.g., ["views"] for app-specific dirs)

    Returns:
        List of (section_path, section_name) tuples suitable for get_docs_structure()
    """
    paths.ensure_initialized()
    base_dir = paths.get(dir_key)
    if not base_dir or not os.path.isdir(base_dir):
        return [(None, "Overview")] if include_root else []

    exclude_set = set(exclude) if exclude else set()

    # Known sections with their display order (supports nested paths)
    known_order = {
        None: (0, 0),                    # Root/Overview
        "requirements": (1, 0),
        "platform": (2, 0),
        "implementation": (3, 0),
        "deployment": (4, 0),
        "development": (5, 0),
    }

    discovered = []

    # Check root level
    if include_root:
        has_root_files = any(
            f.endswith('.md') and os.path.isfile(os.path.join(base_dir, f))
            for f in os.listdir(base_dir)
        )
        if has_root_files:
            discovered.append((None, "Overview"))

    def scan_dir(rel_path, depth):
        """Recursively scan directory for sections with .md files."""
        if depth > max_depth:
            return

        full_path = os.path.join(base_dir, rel_path) if rel_path else base_dir
        if not os.path.isdir(full_path):
            return

        for item in os.listdir(full_path):
            if item.startswith('.'):
                continue

            # Skip excluded directories
            if item in exclude_set:
                continue

            item_rel_path = os.path.join(rel_path, item) if rel_path else item
            item_full_path = os.path.join(full_path, item)

            if not os.path.isdir(item_full_path):
                continue

            # Check if this directory has .md files directly
            has_md = any(f.endswith('.md') for f in os.listdir(item_full_path)
                        if os.path.isfile(os.path.join(item_full_path, f)))

            if has_md:
                # Convert path to display name
                # "implementation/slideshow" -> "Slideshow" (use last part)
                # "platform" -> "Platform"
                display_part = item.replace('-', ' ').replace('_', ' ').title()
                discovered.append((item_rel_path, display_part))

            # Recurse into subdirectories
            scan_dir(item_rel_path, depth + 1)

    scan_dir("", 1)

    # Sort: known sections first in order, nested sections after their parent
    def sort_key(entry):
        path, _ = entry
        if path in known_order:
            return known_order[path]
        # For nested paths like "implementation/slideshow",
        # sort after parent "implementation"
        if path and '/' in path:
            parent = path.split('/')[0]
            if parent in known_order:
                parent_order = known_order[parent]
                return (parent_order[0], parent_order[1] + 1)
        return (99, path or "")

    discovered.sort(key=sort_key)
    return discovered


def list_files(dir_key):
    """List all markdown files in a directory.

    Args:
        dir_key: Key registered with paths.register(), e.g. "HELP_DIR"

    Returns:
        List of filenames like ["index.md", "api.md", ...]
    """
    paths.ensure_initialized()
    base_dir = paths.get(dir_key)
    if not base_dir or not os.path.isdir(base_dir):
        return []

    files = []
    for f in os.listdir(base_dir):
        if f.endswith('.md') and os.path.isfile(os.path.join(base_dir, f)):
            files.append(f)
    return sorted(files)


def list_files_recursive(dir_key):
    """List all markdown files in a directory recursively.

    Args:
        dir_key: Key registered with paths.register()

    Returns:
        List of relative paths like ["index.md", "subdir/file.md", ...]
    """
    paths.ensure_initialized()
    base_dir = paths.get(dir_key)
    if not base_dir or not os.path.isdir(base_dir):
        return []

    files = []
    for root, _, filenames in os.walk(base_dir):
        for f in filenames:
            if f.endswith('.md'):
                rel_path = os.path.relpath(os.path.join(root, f), base_dir)
                files.append(rel_path)
    return sorted(files)


def load_file(dir_key, filename):
    """Load a markdown file from a registered directory.

    Args:
        dir_key: Key registered with paths.register()
        filename: Relative path within the directory

    Returns:
        File content as string, or None if not found or invalid path
    """
    paths.ensure_initialized()
    base_dir = paths.get(dir_key)
    if not base_dir:
        return None

    # Security: block path traversal
    if '..' in filename:
        logger.warning(f"Path traversal attempt blocked: {filename}")
        return None

    filepath = os.path.join(base_dir, filename)

    # Verify the resolved path is still within base_dir
    real_path = os.path.realpath(filepath)
    real_base = os.path.realpath(base_dir)
    if not real_path.startswith(real_base + os.sep) and real_path != real_base:
        logger.warning(f"Path escape attempt blocked: {filename}")
        return None

    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            return f.read()
    except FileNotFoundError:
        return None


def extract_title_and_description(filepath):
    """Extract the first H1 heading and first sentence from a markdown file.

    Args:
        filepath: Full path to the markdown file

    Returns:
        Tuple of (title, description). Description is the first sentence
        after the H1 heading, or None if not found.
    """
    title = None
    description = None

    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            found_title = False
            collecting_desc = False
            desc_lines = []

            for line in f:
                # Find title (first H1)
                if not found_title and line.startswith('# '):
                    title = line[2:].strip()
                    found_title = True
                    collecting_desc = True
                    continue

                # Collect description after title
                if collecting_desc:
                    stripped = line.strip()

                    # Skip empty lines right after title
                    if not stripped and not desc_lines:
                        continue

                    # Stop at next heading, code block, or horizontal rule
                    if stripped.startswith('#') or stripped.startswith('```') or stripped.startswith('---'):
                        break

                    # Skip certain markdown elements
                    if stripped.startswith('|') or stripped.startswith('-') or stripped.startswith('*'):
                        if not desc_lines:  # Skip if we haven't started collecting
                            continue
                        break  # Stop if we hit a list/table after text

                    if stripped:
                        desc_lines.append(stripped)

                    # Check if we have a complete sentence
                    combined = ' '.join(desc_lines)
                    # Find first sentence ending with . ! or ?
                    for i, char in enumerate(combined):
                        if char in '.!?' and i > 10:  # Minimum sentence length
                            # Make sure it's not an abbreviation (e.g., "e.g.")
                            if i + 1 >= len(combined) or combined[i + 1] in ' \n':
                                description = combined[:i + 1]
                                break
                    if description:
                        break

    except (FileNotFoundError, IOError):
        pass

    # Fallback for title: filename without extension, formatted
    if not title:
        basename = os.path.basename(filepath).replace('.md', '')
        title = basename.replace('-', ' ').replace('_', ' ').title()

    return title, description


def extract_title(filepath):
    """Extract the first H1 heading from a markdown file.

    Args:
        filepath: Full path to the markdown file

    Returns:
        Title string (from first H1 or fallback to filename)
    """
    title, _ = extract_title_and_description(filepath)
    return title


def get_structure(dir_key, include_description=False):
    """Get simple file structure with titles.

    For a flat directory of help/doc files.

    Args:
        dir_key: Key registered with paths.register()
        include_description: Whether to extract first sentence as description

    Returns:
        dict with "files" list, each with path and title (and optionally description)
    """
    paths.ensure_initialized()
    base_dir = paths.get(dir_key)
    if not base_dir or not os.path.isdir(base_dir):
        return {"files": []}

    files = []
    for f in list_files(dir_key):
        filepath = os.path.join(base_dir, f)
        if include_description:
            title, desc = extract_title_and_description(filepath)
            entry = {"path": f, "title": title}
            if desc:
                entry["description"] = desc
        else:
            title = extract_title(filepath)
            entry = {"path": f, "title": title}
        files.append(entry)

    # index.md first, then alphabetical
    files.sort(key=lambda d: (0 if d["path"] == "index.md" else 1, d["path"]))

    return {"files": files}


def build_section_from_dir(base_dir, section_path=None, section_name=None):
    """Build a section dict from a directory.

    Args:
        base_dir: Base docs directory path
        section_path: Subdirectory path (None for root level)
        section_name: Name for the section

    Returns:
        dict with "name" and "docs" list, or None if empty
    """
    if section_path:
        scan_dir = os.path.join(base_dir, section_path)
    else:
        scan_dir = base_dir

    if not os.path.isdir(scan_dir):
        return None

    docs = []
    for f in os.listdir(scan_dir):
        if f.endswith('.md'):
            filepath = os.path.join(scan_dir, f)
            if os.path.isfile(filepath):
                title, desc = extract_title_and_description(filepath)
                if section_path:
                    rel_path = os.path.join(section_path, f).replace(os.sep, '/')
                else:
                    rel_path = f
                doc_entry = {"path": rel_path, "title": title}
                if desc:
                    doc_entry["description"] = desc
                docs.append(doc_entry)

    if not docs:
        return None

    # Sort: index.md first, then alphabetically
    docs.sort(key=lambda d: (0 if d["path"].endswith("index.md") else 1, d["path"]))
    return {"name": section_name, "docs": docs}


def get_docs_structure(docs_dir_key="DOCS_DIR", framework_dir_key=None, section_defs=None,
                       auto_discover=True, exclude=None):
    """Get complex documentation structure with sections.

    For multi-directory documentation with custom section ordering.

    Args:
        docs_dir_key: Key for main docs directory
        framework_dir_key: Key for framework docs (appended as "AIDE Frame" section)
        section_defs: List of (section_path, section_name) tuples defining order.
                     Use None as section_path for root-level files.
                     If None and auto_discover=True, sections are auto-discovered.
        auto_discover: If True and section_defs is None, auto-discover sections
                      from directory structure. Default: True.
        exclude: List of directory names to exclude from auto-discovery
                (e.g., ["views"] for app-specific directories that aren't docs)

    Returns:
        dict with "sections" list
    """
    paths.ensure_initialized()
    sections = []

    base_dir = paths.get(docs_dir_key)

    # Auto-discover sections if not provided
    if section_defs is None:
        if auto_discover:
            section_defs = auto_discover_sections(docs_dir_key, exclude=exclude)
        else:
            section_defs = [(None, "Overview")]

    # Helper to build framework section
    def build_framework_section():
        """Build AIDE Frame section from framework docs directory."""
        if not framework_dir_key:
            return None
        frame_dir = paths.get(framework_dir_key)
        if not frame_dir or not os.path.isdir(frame_dir):
            return None

        docs = []

        # Scan root-level .md files
        for f in os.listdir(frame_dir):
            if f.endswith('.md'):
                filepath = os.path.join(frame_dir, f)
                if os.path.isfile(filepath):
                    title, desc = extract_title_and_description(filepath)
                    doc_entry = {"path": f, "title": title, "framework": True}
                    if desc:
                        doc_entry["description"] = desc
                    docs.append(doc_entry)

        # Scan subdirectories (spec/, python/, js/)
        for subdir in os.listdir(frame_dir):
            subdir_path = os.path.join(frame_dir, subdir)
            if os.path.isdir(subdir_path) and not subdir.startswith('.'):
                for f in os.listdir(subdir_path):
                    if f.endswith('.md'):
                        filepath = os.path.join(subdir_path, f)
                        if os.path.isfile(filepath):
                            title, desc = extract_title_and_description(filepath)
                            rel_path = f"{subdir}/{f}"
                            doc_entry = {"path": rel_path, "title": title, "framework": True}
                            if desc:
                                doc_entry["description"] = desc
                            docs.append(doc_entry)

        if not docs:
            return None

        # Sort: root index.md first, then by directory (root, spec, python, js), then by path
        def sort_key(d):
            path = d["path"]
            is_index = path.endswith("index.md")
            is_root = "/" not in path

            # Root index.md comes first
            if is_root and is_index:
                return (0, "", path)
            # Root files next
            if is_root:
                return (1, "", path)
            # Subdirectory files: group by directory, index.md first within each
            subdir = path.split("/")[0]
            # Order: spec before python before js
            subdir_order = {"spec": 0, "python": 1, "js": 2}.get(subdir, 3)
            return (2, subdir_order, 0 if is_index else 1, path)

        docs.sort(key=sort_key)

        return {"name": "AIDE Frame", "docs": docs, "framework": True}

    # No docs dir? Return just framework section if available
    if not base_dir or not os.path.isdir(base_dir):
        frame_section = build_framework_section()
        if frame_section:
            sections.append(frame_section)
        return {"sections": sections}

    # Build sections from definitions
    frame_section = build_framework_section()
    aide_frame_inserted = False

    # Sections that should come after AIDE Frame
    late_sections = {"deployment", "development"}

    for section_path, section_name in section_defs:
        # Legacy support: skip AIDE_FRAME marker (now handled automatically)
        if section_path == "AIDE_FRAME":
            continue

        # Insert AIDE Frame before late sections (deployment, development)
        if section_path in late_sections and frame_section and not aide_frame_inserted:
            sections.append(frame_section)
            aide_frame_inserted = True

        section = build_section_from_dir(base_dir, section_path, section_name)
        if section:
            sections.append(section)

    # Add AIDE Frame docs at end if not inserted before late sections
    if frame_section and not aide_frame_inserted:
        sections.append(frame_section)

    return {"sections": sections}
