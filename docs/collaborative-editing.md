# Collaborative Editing

Per-directory edit permissions for documentation using `.edit` files.

## Overview

The docs viewer supports collaborative editing where specific users can edit and create documents in designated directories. Permissions are controlled via `.edit` files placed in the directory tree — no changes to the application's role/permission system are needed.

## .edit File Format

Place a file named `.edit` in any docs directory to control who can edit documents there:

```
# Users who can edit documents in this directory
admin
user:gero
user:frank
```

**Rules:**
- `admin` — all users with role `admin` may edit
- `user:username` — the specific user with that username may edit
- Lines starting with `#` are comments
- Empty lines are ignored

## Permission Resolution

When a user attempts to edit or create a document, the server walks up from the file's directory to the docs root looking for a `.edit` file:

1. Check the file's own directory for `.edit`
2. If not found, check the parent directory
3. Continue up to the docs root

**If a `.edit` file is found:**
- User matches an entry → editing allowed
- User doesn't match → editing denied
- The `.edit` file **overrides** the global `editRequiresAdmin` setting

**If no `.edit` file is found anywhere in the path:**
- Fall back to the existing behavior (`editRequiresAdmin`, `docsEditable`, etc.)

## Inheritance

A `.edit` file applies to its directory and **all subdirectories** unless a subdirectory contains its own `.edit` file. This allows fine-grained control:

```
docs/
  .edit              ← admin only (global default)
  project/
    .edit            ← admin + specific users (overrides parent)
    migration.md     ← editable by project team
    data-collection.md
  classes/           ← no .edit → inherits from docs/.edit (admin only)
```

## Creating New Documents

When a user has edit permission in a directory, a `+` button appears in the sidebar header. Clicking it opens a dialog to enter the document title. The server creates the file with:

```markdown
# Document Title

Describe the purpose of this document here. The first sentence appears as tooltip in the sidebar.
```

After creation, the sidebar reloads and the new document opens for editing.

## API Endpoints

### GET /api/viewer/can-edit

Check if the current user can edit a specific document.

**Query parameters:** `root`, `path`
**Response:** `{ canEdit: true|false }`

### POST /api/viewer/create

Create a new markdown document.

**Body:** `{ root, directory, filename }`
**Response:** `{ success: true, path: "project/my-doc.md" }`

The filename is sanitized (alphanumeric, hyphens, underscores, spaces). `.md` extension is added automatically if missing. The title is derived from the filename.

## Sidebar Visibility

`.edit` files are hidden from the sidebar tree (files starting with `.` are filtered out automatically).

## noauth Mode

When the server runs with `--noauth`, there is no `req.user` object. In this case:
- If a `.edit` file exists → editing is **denied** (no user to match against)
- If no `.edit` file → editing follows the global `docsEditable` / `editRequiresAdmin` settings (which typically allow editing in noauth mode)
