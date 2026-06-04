# Viewer search deeplinks

URL convention for linking from any document to the viewer's full-text **search dialog** with a pre-filled query.

## Pattern

A markdown link of the form `[term](search?q=term)` renders as a clickable link that:

1. Navigates the viewer to its `/search` route
2. Pre-fills the **search input** with the query string from `q`
3. Auto-runs the **FTS5** search across all configured roots (default: every root)
4. Displays results in the standard search-result panel

The link is resolved against the current document URL. For a document mounted at `/about?doc=product/object-model.md`, the relative link `search?q=ql` resolves to `/search?q=ql`. With a reverse-proxy base path (e.g. `/online`), it resolves to `/online/search?q=ql` — no manual prefixing required.

## Why this pattern

Conventional inline doc links resolve to a single file. For **technical terms** that are documented as inline bullets within a feature catalogue (e.g. `features/index.md` with its 700+ FTS5-searchable entries), no single-file destination exists. The search deeplink lets a writer link a term to the *query* rather than to a *file*, deferring the resolution to whichever entry the FTS5 ranking surfaces first.

This makes the linked terms still navigable without forcing the writer to commit to a specific bullet — and lets the document survive feature-catalogue restructuring.

## URL parameters

| Parameter | Effect |
|---|---|
| `q` | Pre-fill the search input and auto-run the search |
| `roots` | Comma-separated list of search roots; defaults to all configured roots |

## Reference implementation

Search auto-execution from URL parameters lives in [`viewer.html`](../../static/templates/viewer.html) (functions `buildSearchUI` and `doSearch`); the search API is served by the host app under `/api/viewer/search?q=...&roots=...`.

## Example uses

- `[ql](search?q=ql)` — link to a search for the term `ql`
- `[STARRED](search?q=STARRED)` — link to a search for the `[STARRED]` UI annotation
- `[FK traversal](search?q=FK+traversal)` — multi-word query, URL-encoded with `+`
- `[poly-fk](search?q=poly-fk&roots=docs,rap)` — search restricted to two roots

## Canonical consumer

The pattern was introduced 2026-06-04 as the basis for cross-referencing technical terms from conceptual documents to feature documentation **without one-to-one file binding**. The canonical user is `aide-rap/app/docs/product/object-model.md`, which uses this pattern for ~30 terms in its definitional reference for senior software architects encountering RAP for the first time.

## Self-referentiality

A reader who clicks one of these links from `object-model.md` lands in the search dialog and finds — among the FTS5 results — this very document. The pattern documents itself through its own use.
