## 1. CLI Behavior Tests

- [x] 1.1 Add CLI tests for `casegraph cases analysis --help` and `casegraph cases analysis new --help`.
- [x] 1.2 Add CLI tests for `casegraph cases analysis new <case-id>` creating one review-only analysis artifact.
- [x] 1.3 Add CLI tests for omitted case ID resolution with exactly one valid case.
- [x] 1.4 Add CLI tests for zero-case, multiple-case, missing-workspace, missing-argument, and extra-token failures.

## 2. Analysis Artifact Model

- [x] 2.1 Define a Zod model for the persisted analysis artifact shape.
- [x] 2.2 Add deterministic analysis artifact creation logic that records IDs, timestamps, status, source record IDs, and initialized review sections.
- [x] 2.3 Add metadata collection for registered evidence records and determinable complaint or pleading candidate records.

## 3. History And Persistence

- [x] 3.1 Create `workspace/<case-id>/analysis/` on demand without overwriting existing analysis files.
- [x] 3.2 Write analysis creation provenance under `.history/` with command, timestamp, case ID, analysis ID, output path, and source record IDs.
- [x] 3.3 Ensure analysis creation does not modify existing graph record YAML files.

## 4. Commander Integration

- [x] 4.1 Add a real `cases analysis` Commander subcommand group.
- [x] 4.2 Add the `cases analysis new` Commander subcommand with strict positional argument handling.
- [x] 4.3 Wire omitted-case resolution through existing case workspace helpers.
- [x] 4.4 Print success output with analysis ID, artifact path, and accepted-graph-not-changed message.

## 5. Validation

- [x] 5.1 Run the focused CLI test suite and fix failures.
- [x] 5.2 Run `npm run validate`.
- [x] 5.3 Run `npm run openspec:validate`.
