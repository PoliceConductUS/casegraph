## Context

CaseGraph currently starts with repo-local case workspaces under `workspace/<case-id>`. The accepted identity model scopes graph node IDs to a case workspace and stores each node as `<node-id>.yaml`, with the file name stem matching the node ID.

This change adds the first document-recording behavior for an existing case workspace. The user supplied an intentionally narrow initial scope: only complaint documents, external PDF path recording only, no edge storage, no parent field, no remove command, and no second complaint.

## Goals / Non-Goals

**Goals:**

- Add `casegraph cases add document <case-id> complaint <path-to-pdf>`.
- Require an existing `workspace/<case-id>` case workspace.
- Create `workspace/<case-id>/complaint.yaml`.
- Store a minimal document node with `type: node`, `kind: document`, `id: complaint`, `document_type: complaint`, and the provided path.
- Validate that the provided path exists, is readable, is a regular file, and starts with the PDF signature.
- Reject missing arguments, extra positional tokens, unsupported document types, missing workspaces, and duplicate complaint records.

**Non-Goals:**

- Do not copy, parse, hash, or import the PDF.
- Do not extract facts, parties, court, jurisdiction, filing dates, claims, laws, decisions, citations, or references.
- Do not summarize the complaint.
- Do not identify strengths, weaknesses, missing documents, related cases, or hypotheses.
- Do not expand the case graph beyond the single complaint document node.
- Do not add support for document types other than `complaint`.
- Do not add edge files, parent fields, graph traversal, or graph editing abstractions.
- Do not add a remove command.
- Do not create a case workspace from this command.
- Do not add default/current-case behavior.

## Decisions

The command should be implemented as a direct CLI path for the exact shape:

```bash
casegraph cases add document <case-id> complaint <path-to-pdf>
```

This follows ADR 0003's command-first convention for commands that operate on an existing case workspace. It also keeps each positional token meaningful, which lets the parser reject any extra tokens before writing.

The complaint node ID and file name are fixed:

```text
workspace/<case-id>/complaint.yaml
```

The fixed ID is appropriate because the initial scope allows only one complaint per case workspace. Rejecting an existing `complaint.yaml` is safer than overwriting a case record.

The YAML should use the existing node serialization style where practical. The required fields are:

```yaml
type: node
kind: document
id: complaint
document_type: complaint
path: "<path-to-pdf>"
```

If the existing root node writer always includes timestamps, the implementation may include matching `created_at` and `updated_at` timestamps for consistency. It must not include null placeholders, edge fields, or `parent`.

The PDF path is recorded exactly as provided after boundary validation confirms the path exists, is readable, is a regular file, and starts with `%PDF-`. Path normalization, copy/import behavior, extraction, analysis, summarization, and graph expansion are out of scope because each would add product decisions beyond the requested behavior.

Successful `casegraph cases new <case-id>` output should point to the exact complaint document command shape with the newly created case ID. Successful complaint recording output should point to `casegraph cases augment` with no arguments as the future command for reporting directly referenced items that are not yet in the graph. This change only adds the guidance; it does not implement augmentation.

## Recommended Design Principles

- Graph storage: cyclic allowed.
- Traversal execution: depth-limited, visited-set required.
- Augmentation writes: explicit `--write`; otherwise dry-run.

## Risks / Trade-offs

- [Risk] Recording an external path can become stale if the PDF moves. -> Mitigation: this is explicit in the scope; future import or provenance behavior can be specified separately.
- [Risk] Supporting only one complaint will not handle amended complaints. -> Mitigation: reject second complaints now; add amended complaint behavior later only when a concrete workflow requires it.
- [Risk] PDF validation can be mistaken for full PDF parsing. -> Mitigation: validate only the file boundary and PDF signature; do not parse, hash, extract, or copy contents.
- [Risk] The current durable spec set is empty even though a prior change exists. -> Mitigation: define this as a new `case-documents` capability and keep it consistent with accepted ADRs and existing change artifacts.
