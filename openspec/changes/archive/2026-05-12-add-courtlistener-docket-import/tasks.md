## 1. Dependencies And CLI Shape

- [x] 1.1 Add `@paralleldrive/cuid2` as a runtime dependency using the current checked version `3.3.0`.
- [x] 1.2 Add CLI parsing and help for `casegraph cases import courtlistener <docket-id> [--dry-run | --write]`.
- [x] 1.3 Reject missing docket ID, extra positional tokens, and combined `--dry-run --write` with clear errors.
- [x] 1.4 Require `COURTLISTENER_API_TOKEN` for CourtListener import and ensure token values are never printed.

## 2. CourtListener REST Client

- [x] 2.1 Implement a minimal CourtListener REST request helper that accepts a token, method, URL, and request ID.
- [x] 2.2 Fetch docket detail, paginated docket entries, parties, attorneys, and RECAP documents for a docket ID.
- [x] 2.3 Preserve request metadata and full response bodies with authorization headers redacted.
- [x] 2.4 Make CourtListener errors and rate limits visible in command output without hiding partial source results.

## 3. Mutation History

- [x] 3.1 Generate compact CUID2-based mutation IDs for write imports.
- [x] 3.2 Write `workspace/<case-id>/.history/index.yaml` preserving mutation order.
- [x] 3.3 Write `workspace/<case-id>/.history/<mutation-id>/manifest.yaml` with full argv, request list, timestamps, and status.
- [x] 3.4 Write each named request as `<request-id>.yaml` in the mutation folder.

## 4. Workspace And Graph Records

- [x] 4.1 Derive a safe case ID from CourtListener docket slug or case name.
- [x] 4.2 Reject unsafe derived case IDs and existing workspaces without guessing or auto-suffixing.
- [x] 4.3 On `--write`, create the case workspace and `root.yaml` with `sources[]` references to the import mutation.
- [x] 4.4 Write imported CourtListener docket, party, attorney, docket-entry, and RECAP document graph records.
- [x] 4.5 Record all imported relationships as properties and create no graph edge records.

## 5. Filing-Level Citations

- [x] 5.1 Preserve RECAP document `cites` arrays as filing/document properties.
- [x] 5.2 Attempt citation lookup only where available under the chosen implementation boundary.
- [x] 5.3 Preserve successful citation lookup results as properties or source-backed references.
- [x] 5.4 Report incomplete citation lookup caused by rate limits or unavailable text without claiming full citation success.

## 6. Verification

- [x] 6.1 Add tests for dry-run, write, duplicate workspace, unsafe derived case ID, and hard argument errors.
- [x] 6.2 Add tests that token values are not printed or persisted and authorization headers are redacted.
- [x] 6.3 Add tests for mutation history index, manifest, request files, and `sources[]` references.
- [x] 6.4 Add tests that filing-level citations are properties and no docket-level citation or graph edge is created.
- [x] 6.5 Run `npm run validate` and record results in `verify.md` during apply.
