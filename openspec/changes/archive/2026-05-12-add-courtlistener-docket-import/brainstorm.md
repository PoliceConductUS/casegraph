## Design Summary

Add `casegraph cases import courtlistener <docket-id> [--dry-run | --write]`
as a narrow CourtListener REST bootstrap command. The command creates a new case
workspace from a CourtListener docket when `--write` is provided and reports the
planned import without mutation by default.

The command uses `COURTLISTENER_API_TOKEN` from the environment and never prints
or persists the token. It fetches docket, docket-entry, party, attorney, RECAP
document, and filing-level citation data available from documented CourtListener
REST endpoints. It does not use CourtListener MCP and does not scrape
CourtListener HTML.

The command derives a safe case ID from CourtListener docket data and rejects
the write if the workspace already exists. It preserves raw request/response
records under `workspace/<case-id>/.history/<mutation-id>/`, where each mutation
ID is compact and generated with CUID2. `workspace/<case-id>/.history/index.yaml`
preserves mutation order. Each mutation folder contains `manifest.yaml` and
one YAML file per named request.

Graph records use `sources[]` arrays that reference mutation ID, request ID, and
source paths. All relationships remain node properties by default. The import
does not create graph edges because no legal analysis requiring an edge is part
of this change.

CourtListener citation modeling follows the verified REST behavior: dockets do
not cite authorities; filings/RECAP documents cite authorities. Filing-level
`recap_documents[].cites` data and available citation lookup results are stored
as source-backed properties on imported filing/document records.

## Alternatives Considered

### Option A: Import Into an Existing Case Workspace

- **Approach**: Require `casegraph cases import courtlistener <case-id> <docket-id>`.
- **Pros**: Avoids deriving case IDs and separates case creation from source
  import.
- **Cons**: Adds manual setup for the first bootstrap and duplicates information
  CourtListener already has.
- **Why not chosen**: The desired workflow is to bootstrap a new case directly
  from the CourtListener docket.

### Option B: Bootstrap New Case From CourtListener Docket

- **Approach**: Use `casegraph cases import courtlistener <docket-id>` to create
  a new case workspace on `--write`.
- **Pros**: Matches the current bootstrap goal, keeps the command narrow, and
  lets CourtListener docket metadata seed the case root.
- **Cons**: Requires strict duplicate handling and safe case ID derivation.
- **Why chosen**: It is the smallest useful workflow for the current case.

### Option C: Generic Source Import Framework

- **Approach**: Introduce a source connector layer for CourtListener, local
  files, cloud drives, email, S3, and future sources.
- **Pros**: Could provide uniform source abstractions later.
- **Cons**: Speculative and much larger than the current outcome.
- **Why not chosen**: The current need is one concrete CourtListener bootstrap,
  not a connector framework.

## Agreed Approach

Use Option B. Implement a CourtListener-specific docket import command that
creates a new case workspace only when `--write` is present, preserves raw API
responses in mutation history, records source references on graph records, and
does not create edges or analysis records.

## Key Decisions

- Command shape: `casegraph cases import courtlistener <docket-id> [--dry-run | --write]`.
- Dry-run is the default.
- `COURTLISTENER_API_TOKEN` is read from the environment and never persisted.
- CourtListener REST is used; CourtListener MCP and HTML scraping are out of
  scope.
- Case ID is derived from CourtListener docket slug/name and must be rejected if
  it would collide with an existing workspace.
- Mutation IDs are compact CUID2 values.
- Mutation order is preserved in `workspace/<case-id>/.history/index.yaml`.
- Raw request/response records are written as named YAML files directly in the
  mutation folder.
- `manifest.yaml` records full command argv and request file mapping.
- Graph records use `sources[]` arrays referencing mutation ID, request ID, and
  source paths.
- All relationships are properties by default.
- This change does not create graph edges.
- Filing-level citation data belongs to filings/RECAP documents, not dockets.

## Open Questions

- Exact imported graph record file names should be finalized in design.
- The first implementation should decide whether citation lookup is required for
  every text-bearing RECAP document or only stored when available without
  rate-limit failure.
