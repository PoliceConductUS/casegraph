## Why

CaseGraph needs a reliable way to bootstrap the current case from structured CourtListener docket data instead of manually recreating docket, party, filing, and citation records. CourtListener REST already exposes the first-order public case data needed for this workflow, and preserving raw responses gives the audit trail future analysis will need.

## What Changes

**CourtListener Docket Import**

- From: CaseGraph can create empty case workspaces and record a complaint PDF
  path, but it cannot import structured docket data.
- To: `casegraph cases import courtlistener <docket-id> [--dry-run | --write]`
  previews or writes a new case workspace from CourtListener REST data.
- Reason: The current case can be bootstrapped from docket `10000001` and later
  cases should use the same repeatable path.
- Impact: Adds a new CLI command, network access to CourtListener REST, mutation
  history files under `workspace/<case-id>/.history/`, and a runtime dependency
  on `@paralleldrive/cuid2`.

**Source Preservation**

- From: Source preservation exists only as discussion and manual exploration
  files.
- To: Each write import creates an ordered mutation history entry with compact
  CUID2 mutation ID, manifest, request metadata, full response bodies, and
  redacted secrets.
- Reason: Future analysis must be auditable and derived graph records need
  stable source references.
- Impact: Imported graph records include `sources[]` arrays that reference
  mutation ID, request ID, and source paths.

**Citation Scope**

- From: Citation handling is not implemented.
- To: CourtListener filing-level citation data is preserved on imported
  filing/document records as properties.
- Reason: Dockets do not cite authorities; filings/RECAP documents do.
- Impact: The import stores citation data without creating legal-analysis edges.

## Capabilities

### New Capabilities

- `courtlistener-import`: Defines CourtListener docket import behavior,
  authentication, raw response history, imported graph record source references,
  and filing-level citation import.

### Modified Capabilities

- `case-workspaces`: Adds a second way to create a case workspace, by importing
  a CourtListener docket on `--write`.

## Impact

- CLI parser and help output.
- Case workspace creation behavior.
- New `workspace/<case-id>/.history/` operation history files.
- CourtListener REST client code.
- YAML serialization for request/response records and imported graph records.
- Runtime dependency: `@paralleldrive/cuid2` version `3.3.0` checked during
  proposal.
- Tests for dry-run/write behavior, token handling, duplicate workspaces, hard
  argument errors, request preservation, source references, and citation scope.
