## Context

CaseGraph currently keeps case data in repo-local `workspace/<case-id>/` directories and uses local graph node files whose file name stem matches the node ID. CourtListener import already generates opaque local IDs for imported graph records. The next workflow after import and report is to register external evidence files so analysis can later propose support links.

The command must stay under the existing `cases` group and preserve strict argument validation. Evidence registration should not reuse or extend the complaint-specific document path because this change is about evidence as a graph concept, not a general document registry.

## Goals / Non-Goals

**Goals:**

- Add `casegraph cases add evidence <case-id> <path-to-file>`.
- Add `casegraph cases add evidence <path-to-file>` only when exactly one valid case exists.
- Validate that the path exists, is readable, and is a regular file.
- Create one `kind: evidence` graph node whose ID is the SHA-256 hex digest of the file content.
- Record the path provided by the user and timestamps.
- Record SHA-256 hash metadata.
- Preserve the successful add command in `.history/`.
- Print the created node path and node ID.
- Add typed graph record schemas for current `type: node` / `kind` combinations.
- Use graph traversal from `root` to report unlinked records after evidence is registered.

**Non-Goals:**

- Do not add generic `casegraph cases add <type>`.
- Do not add `filing`, `response`, `authority`, or other record types.
- Do not remove the complaint-specific document command.
- Do not copy, parse, hash, summarize, classify, transcribe, or inspect file type.
- Do not infer facts, claims, evidence support, or legal conclusions.
- Do not create edges, aliases, analysis artifacts, support matrices, or legal research behavior.

## Decisions

### Add a Concrete Evidence Commander Subcommand

The implementation will add `cases add evidence` as a real nested Commander subcommand rather than routing through a generic `cases add <resource>` dispatcher. The existing `cases add document` path should also remain a concrete nested subcommand. Only evidence is added by this change.

### Use Content Hash Evidence IDs

Evidence nodes will use the SHA-256 hex digest of the file content as the node ID. The file path will be `workspace/<case-id>/<sha256hex>.yaml`, and the YAML `id` field will match the file name stem. Re-adding the same content fails because the evidence node path already exists.

### Record Metadata Only

The node will contain:

```yaml
type: node
kind: evidence
id: <sha256hex>
path: "<path-to-file>"
hash:
  algorithm: "sha256"
  value: "<sha256hex>"
created_at: "<timestamp>"
updated_at: "<timestamp>"
sources:
  - mutation: "m_<sha256hex>"
    source_system: "local_file"
    source_model: "evidence"
    source_id: "<sha256hex>"
```

Unknown values are omitted. No null placeholders are written.

### Preserve Evidence Add History

Successful evidence adds will write a mutation manifest under `workspace/<case-id>/.history/m_<sha256hex>/manifest.yaml` and append the mutation to `.history/index.yaml`. The manifest records the command argv, evidence path, SHA-256 hash metadata, and created evidence node ID. Failed duplicate-content attempts do not create a second mutation record.

### Keep File Validation Narrow

The command validates only that the path is a readable regular file, then reads the file content only to compute the SHA-256 identity hash. It does not inspect signatures, extensions, MIME types, or semantic file contents.

### Model Current Graph Records With Zod

The implementation will add a small graph record schema layer using Zod. Each current `type: node` / `kind` combination gets its own schema: `case`, `docket`, `party`, `attorney`, `docket_entry`, `document`, and `evidence`.

Each schema also makes node-reference properties explicit:

- `case`: no node-reference properties yet.
- `docket`: `parties`, `attorneys`, and `recap_documents`.
- `party`: `attorneys`.
- `attorney`: no node-reference properties yet.
- `docket_entry`: `recap_documents`.
- `document`: `docket_entry`.
- `evidence`: no node-reference properties yet.

The first consumer is `casegraph cases report`, which should traverse references from `root` and compare reachable node IDs against parsed workspace node IDs.

### Report Unlinked Records

`casegraph cases report <case-id>` will report `Unlinked records: <count>` based on root reachability. `root` is reachable because traversal starts there. A registered evidence node has no inbound reference when first added, so it counts as unlinked until a later graph record references it through a recognized node-reference property.

### Reuse Case Resolution

If the shared case-resolution helpers from `report-imported-case-state` are present, this change should reuse them for omitted-case behavior and workspace validation. If not present in the implementation branch, equivalent behavior should remain small and command-scoped.

## Risks / Trade-offs

- [Risk] Users may expect evidence to be analyzed after adding it. -> Mitigation: success output points to `casegraph cases report <case-id>` and the spec states that evidence proves nothing merely because it was added.
- [Risk] A generic add command may look tempting. -> Mitigation: keep only `evidence` until another concrete type is required.
- [Risk] Hashing large evidence files can take time. -> Mitigation: hash with a file stream and keep all other evidence handling metadata-only.
- [Risk] Unlinked counts can be misleading if reference fields are implicit. -> Mitigation: use schema-declared node-reference fields only, so the count is deterministic and auditable.
