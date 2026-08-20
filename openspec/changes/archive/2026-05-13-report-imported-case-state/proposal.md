## Why

After importing a case from CourtListener, the user needs the imported docket to read like a legal docket: a chronological summary of documents filed and actions taken in the court case. Counts alone do not answer what happened in the case or what the next review target should be.

## What Changes

**Case Docket Reporting**

- From: CaseGraph can create and import case workspaces, but it has no command that summarizes the imported workspace state.
- To: CaseGraph provides `casegraph cases report <case-id>` and `casegraph cases report` when exactly one valid case exists.
- Reason: The first useful post-import action is reading the court case chronology.
- Impact: Non-breaking new command surface under the existing `cases` group.

The report will print a read-only legal docket ordered by docket entry filed date and entry number. Each visible docket entry will show the filed date, docket entry number when present, docket action text, and related imported document references when visible.

The command will not mutate the graph, add evidence, create analysis files, parse documents, infer facts, create claims, create edges, perform legal research, or preserve/extend the complaint-specific document command.

## Capabilities

### New Capabilities

- `case-reports`: Defines read-only case report commands that summarize current case workspace docket chronology.

### Modified Capabilities

- None.

## Impact

- Adds CLI parsing for `casegraph cases report`.
- Adds a read-only report implementation that reads existing workspace YAML files.
- Adds tests for explicit case ID, omitted case ID, invalid cases, extra tokens, report help, chronological docket ordering, and read-only behavior.
- Updates CLI help text for the new report command.
- Adds no dependencies, network calls, graph mutations, or new persistence format.
