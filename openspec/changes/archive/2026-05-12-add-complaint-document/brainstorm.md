## Design Summary

Add one narrowly scoped document-recording command:

```bash
casegraph cases add document <case-id> complaint <path-to-pdf>
```

The command records an external complaint PDF path in an existing case workspace by creating `workspace/<case-id>/complaint.yaml`. The YAML file is a graph node record with `type: node`, `kind: document`, `id: complaint`, and `document_type: complaint`.

The command does not copy, parse, hash, or import the PDF. It records only the external path the user provided after confirming the path exists, is readable, and starts with the PDF signature. The first supported document type is `complaint`; no other document types are accepted in this change.

The command must reject missing arguments, unexpected extra tokens, unsupported document types, missing case workspaces, and an existing complaint record. It must not create edges, parent fields, remove commands, default-case behavior, or broader graph mutation support.

## Alternatives Considered

### Option A: Record only the complaint document node

- **Approach**: Add one command that writes `workspace/<case-id>/complaint.yaml` for the `complaint` document type and rejects all broader behavior.
- **Pros**: Smallest useful behavior, matches the user's requested scope, preserves the current filesystem-scoped node identity model, and keeps failure modes explicit.
- **Cons**: Does not preserve copied source material, does not support multiple complaints or amended complaints, and does not create graph relationships yet.
- **Why chosen**: This is the only option that satisfies the requested initial scope without inventing broader document management requirements.

### Option B: Copy the PDF into the case workspace

- **Approach**: Accept a complaint PDF path, copy the file under the case workspace, and write metadata pointing at the copied file.
- **Pros**: Better preserves raw input inside the repo-local workspace.
- **Cons**: The user explicitly requested recording the external PDF path only. Copy semantics raise immediate questions about naming, overwrite behavior, provenance, large files, and whether PDFs should be committed.
- **Why not chosen**: It exceeds current scope and introduces product decisions that have not been requested.

### Option C: Build a generic document add command

- **Approach**: Implement `casegraph cases add document <case-id> <document-type> <path>` with a registry or flexible document-type validation for many document types.
- **Pros**: Could support future document types with less command-shape churn.
- **Cons**: Adds unsupported behavior, validation decisions, naming rules, and schema surface before there is a concrete need.
- **Why not chosen**: The current outcome only supports `complaint`. A generic document system would be speculative.

## Agreed Approach

Use Option A. The implementation should add a command-specific path for `casegraph cases add document <case-id> complaint <path-to-pdf>` and write one node file at `workspace/<case-id>/complaint.yaml`.

The data shape is intentionally minimal:

```yaml
type: node
kind: document
id: complaint
document_type: complaint
path: "<path-to-pdf>"
```

Existing timestamp conventions may be reused if the current implementation consistently timestamps node records. The command should not add `parent`, edge storage, PDF copying, PDF parsing, remove behavior, or a general document type registry.

## Key Decisions

- The command operates on an existing case workspace and must not create a case workspace.
- The only accepted document type is the literal token `complaint`.
- The output file is always `workspace/<case-id>/complaint.yaml`.
- The node ID is always `complaint`, matching the file name stem.
- A second complaint is rejected because overwriting would risk losing case data.
- Extra positional tokens are hard errors.
- The PDF path is recorded as provided after confirming it is a readable PDF file.
- No edge storage or `parent` field is created.

## Open Questions

None for the initial scope.
