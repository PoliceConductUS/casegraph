## Context

CaseGraph currently creates repo-local case workspaces and records a complaint
PDF path, but it cannot bootstrap a case from structured public docket data.
CourtListener REST can provide docket metadata, parties, attorneys, docket
entries, RECAP documents, filing-level `cites` data, and citation lookup
results. The user has verified with docket `10000001` that citation
relationships are filing/document-level, not docket-level.

The import must preserve auditability without creating a broad source connector
framework. ADR 0004 also constrains graph modeling: all relationships are node
properties by default, and edges require an explicitly defined legal analysis
need plus required edge properties. This change does not define such an edge.

## Goals / Non-Goals

**Goals:**

- Add `casegraph cases import courtlistener <docket-id> [--dry-run | --write]`.
- Use `COURTLISTENER_API_TOKEN` from the environment without printing or
  persisting it.
- Fetch CourtListener REST docket data and related first-order records.
- Derive a safe case ID from CourtListener docket slug/name.
- Reject writes when the derived workspace already exists.
- Preserve raw request/response records under `workspace/<case-id>/.history/`.
- Generate compact CUID2 mutation IDs and preserve order in
  `.history/index.yaml`.
- Write current graph records with `sources[]` references back to mutation,
  request, and response paths.
- Preserve filing-level citation data as properties on imported filing/document
  records.

**Non-Goals:**

- No PACER direct login or fetch.
- No CourtListener MCP.
- No source connector framework.
- No Google Drive, OneDrive, S3, Gmail, Outlook, or local folder import.
- No BWC, transcript, policy, or local PDF ingestion.
- No OCR or local PDF parsing.
- No fact extraction.
- No legal claim, issue, hypothesis, or argument generation.
- No refresh command.
- No undo/redo.
- No before/after snapshots.
- No graph visualization.
- No global authority library.
- No default/current case behavior changes.
- No duplicate slug auto-suffixes.
- No CourtListener HTML scraping.
- No graph edges.

## Decisions

### Module Boundary

CourtListener docket import behavior lives together under:

```text
src/import/courtlistener/
  docket.ts
  docket.test.ts
  docket.mapping.yaml
```

`src/cli.ts` remains command routing and dispatches to the import module. The
feature module owns CourtListener REST calls, mutation history writing, minimal
graph record creation, and its local mapping file.

### Command Shape

Use:

```bash
casegraph cases import courtlistener <docket-id> [--dry-run | --write]
```

The source name is explicit because `import` will eventually have other sources.
Dry-run is the default. `--dry-run` and `--write` are mutually exclusive. Extra
positional tokens remain hard errors.

### Authentication

Read `COURTLISTENER_API_TOKEN` from the environment. If a write or dry-run needs
CourtListener API access and the token is missing, fail with a clear error. The
token must not appear in stdout, stderr, YAML records, tests, or fixtures.
Request records redact authorization headers.

### Case ID Derivation

Fetch the CourtListener docket first, then derive a safe case ID from the docket
slug/name. If derivation does not produce a valid case ID, fail rather than
guess. If `workspace/<case-id>` already exists, fail and tell the user this
command only bootstraps new cases.

Do not add `--case-id` yet. It is useful later, but the first outcome can be
kept smaller by failing on bad or duplicate derived IDs.

### REST Requests

The implementation should fetch the smallest useful set:

- docket detail
- docket entries, paginated
- parties, paginated if needed
- attorneys, paginated if needed
- RECAP documents for the docket, paginated
- filing-level search or RECAP document data that includes `cites`
- citation lookup only where available and not required to succeed for every
  document

Rate limits or unavailable citation lookup results should be reported as skipped
or incomplete source details, not hidden. The import should still preserve the
source responses it successfully received.

### Mutation History

Use `@paralleldrive/cuid2` for compact mutation IDs. The current published
version checked during proposal is `3.3.0`.

History layout:

```text
workspace/<case-id>/.history/
  index.yaml
  <mutation-id>/
    manifest.yaml
    request-docket.yaml
    request-docket-entries-page-1.yaml
    request-parties.yaml
```

`index.yaml` preserves mutation order:

```yaml
type: history_index
mutations:
  - id: m_ckd9p2xq7a
    started_at: "2026-05-12T14:10:03.123Z"
    command: "casegraph cases import courtlistener 10000001 --write"
    status: success
```

`manifest.yaml` records full command argv and request mappings:

```yaml
type: mutation
id: m_ckd9p2xq7a
started_at: "2026-05-12T14:10:03.123Z"
completed_at: "2026-05-12T14:10:09.441Z"
status: success
command:
  argv:
    - casegraph
    - cases
    - import
    - courtlistener
    - "10000001"
    - --write
requests:
  - id: request-docket
    file: request-docket.yaml
```

Each request file stores request metadata and full response body, with secrets
redacted:

```yaml
type: source_request
id: request-docket
request:
  method: GET
  url: https://www.courtlistener.com/api/rest/v4/dockets/10000001/
  headers:
    accept: application/json
    authorization: redacted
response:
  status: 200
  headers:
    content-type: application/json
  body:
    id: 10000001
    case_name: Example v. Example City
```

### Graph Records

Graph records should stay direct YAML node files under the case workspace for
this change. Do not introduce a new graph folder migration.

Generated imported graph records use opaque local CUID2 IDs. The file stem
matches the record `id`. Do not encode graph type, source system, source model,
or source record ID in generated graph IDs or filenames. Fixed semantic IDs are
used only where already specified, such as `root`.

Example generated record file:

```yaml
type: node
kind: attorney
id: ckd9p2xq7a
name: Saul Pedregon
sources:
  - mutation: m_ckd9p2xq7a
    request: request-attorneys-page-1
    path: $.response.body.results[0]
    source_system: courtlistener
    source_model: attorney
    source_id: 11299034
```

The importer writes only mapped current-graph properties. The mapping file is
intentionally narrow YAML beside the importer:

```yaml
docket:
  kind: docket
  properties:
    court_id: court_id
    case_name: case_name
    docket_number: docket_number
    date_filed: date_filed
```

The mapping format supports only `target_property: source_property` pairs.
Unmapped CourtListener fields remain available in `.history` request files and
are not copied into current graph records. Relationship properties that require
local graph IDs, such as `docket_entries`, `parties`, `attorneys`,
`recap_documents`, `docket_entry`, and `parties_represented`, are handled
explicitly in importer code rather than through a mapping DSL.

Imported records use `sources[]` arrays:

```yaml
sources:
  - mutation: m_ckd9p2xq7a
    request: request-docket
    path: $.response.body
    source_system: courtlistener
    source_model: docket
    source_id: 10000001
```

Relationships such as a case's docket, docket entries, parties, attorneys,
documents, filing citations, and authority references are properties. This
change creates no edge files and no edge records.

### Citation Modeling

The import must model CourtListener citation data at filing/document scope.
Dockets do not cite authorities. A RECAP document may have `cites` values and
may have citation lookup results if plain text is available. Store this as
properties on the imported filing/document record with source references.

## Risks / Trade-offs

- **CourtListener rate limits** -> Preserve successful responses, report skipped
  citation lookup work, and keep the first import useful without retries.
- **Derived case ID is wrong or collides** -> Fail visibly; do not auto-suffix or
  guess a replacement.
- **Raw response files may be large** -> Accept for now because auditability is
  required and this is a personal case workspace.
- **No refresh command yet** -> Import fails for existing workspaces and tells
  the user refresh is not part of this change.
- **No edge records** -> Legal-analysis traversal waits until an OpenSpec change
  defines a concrete edge need and edge properties.

## Migration Plan

No migration is required. Existing case workspaces continue to work. The command
only creates a new case workspace on `--write`.

Rollback is manual deletion of the newly created workspace. This change does not
add undo/redo or before/after snapshots.

## Open Questions

- Whether citation lookup should be attempted for every text-bearing RECAP
  document in the first implementation or limited to filing-level `cites` data
  and optional best-effort lookup.
