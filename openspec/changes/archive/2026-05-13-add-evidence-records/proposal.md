## Why

After importing and reporting a case, the next useful step is registering external evidence files so later analysis can propose links between evidence and facts. CaseGraph needs a strict metadata-only evidence add command that preserves auditability without pretending the evidence proves anything yet.

## What Changes

**Evidence Registration**

- From: CaseGraph can import CourtListener records and report current case state, but it has no evidence registration command.
- To: CaseGraph provides `casegraph cases add evidence <case-id> <path-to-file>` and `casegraph cases add evidence <path-to-file>` when exactly one valid case exists.
- Reason: Evidence files must enter the case workspace as auditable graph nodes before analysis can link them to facts.
- Impact: Non-breaking new command surface under the existing `cases add` group.

The command records evidence metadata only. It accepts any readable regular file, records the path provided by the user, creates one opaque-ID `kind: evidence` node under the case workspace, and prints the created node path and node ID.

The command does not copy, parse, hash, summarize, classify, transcribe, extract facts, link evidence to facts, create claims, create edges, run analysis, perform legal research, add aliases, add other record types, or remove the existing complaint-specific document command.

## Capabilities

### New Capabilities

- `case-evidence`: Defines evidence record creation for external files in case workspaces.

### Modified Capabilities

- None.

## Impact

- Adds CLI parsing for `casegraph cases add evidence`.
- Adds evidence file validation for readable regular files.
- Adds opaque local evidence node creation.
- Adds tests for explicit case ID, omitted case ID, invalid cases, invalid paths, extra tokens, generated node shape, and help output.
- Adds no dependencies, network calls, file copying, parsing, graph edges, or analysis behavior.
