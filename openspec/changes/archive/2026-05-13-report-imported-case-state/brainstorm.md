## Design Summary

Add a narrow case-state report command:

```bash
casegraph cases report <case-id>
casegraph cases report
```

The omitted-case form is valid only when exactly one valid case workspace exists. The report reads existing repo-local YAML records and explains what the case graph currently contains after a CourtListener import, plus the next missing categories before evidence registration or analysis can be useful.

The report is read-only. It does not add evidence, create analysis files, parse documents, infer facts, create claims, create edges, or perform legal research.

## Alternatives Considered

### Option A: Add `casegraph cases report`

- **Approach**: Add one general case report command under the existing `cases` command group.
- **Pros**: Matches the current CLI design, works immediately after import, and leaves room for later report sections without adding new top-level command groups.
- **Cons**: The report name is broad, so the first implementation must keep scope strict.
- **Why chosen**: This is the smallest command that supports the current workflow: import a case, inspect what exists, then decide what to add next.

### Option B: Add `casegraph cases report gaps`

- **Approach**: Start with a named gap report subcommand.
- **Pros**: More specific and closer to the eventual support-analysis goal.
- **Cons**: The graph does not yet contain accepted facts, claims, evidence links, or authority links, so a true gaps report would either be mostly empty or would invent analysis.
- **Why not chosen**: It names a later product report before the data path exists.

### Option C: Add `casegraph reports gaps <case-id>`

- **Approach**: Create a new top-level `reports` command group.
- **Pros**: Could organize many future reports.
- **Cons**: It diverges from the current case-centered CLI and adds a new command surface before more than one report exists.
- **Why not chosen**: It is speculative and larger than the current outcome requires.

## Agreed Approach

Use Option A. Implement `casegraph cases report <case-id>` and the explicit omitted-case form `casegraph cases report` when exactly one valid case exists.

The report should be deterministic and based only on current workspace records. It should summarize imported CourtListener case state and clearly state that evidence, accepted facts, accepted claims, and support analysis are not present yet when no graph records for those categories exist.

## Key Decisions

- Keep the command under `cases`.
- Make the command read-only.
- Treat extra positional tokens as hard errors.
- Reuse the existing omitted-case resolution rule.
- Report imported graph state from local YAML records only.
- Do not depend on network access or CourtListener API calls.
- Do not remove or extend complaint document registration in this change.

## Open Questions

None for this proposal.
