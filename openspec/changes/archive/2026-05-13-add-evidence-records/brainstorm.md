## Design Summary

Add the first evidence registration command:

```bash
casegraph cases add evidence <case-id> <path-to-file>
casegraph cases add evidence <path-to-file>
```

The omitted-case form is valid only when exactly one valid case workspace exists. The command records metadata for one external evidence file as a new graph node under `workspace/<case-id>/<node-id>.yaml`.

This change is metadata-only. It does not copy, parse, hash, summarize, classify, transcribe, extract facts, link evidence to facts, create claims, create edges, run analysis, or perform legal research.

## Alternatives Considered

### Option A: Add concrete `cases add evidence`

- **Approach**: Add a single evidence-specific command with explicit argument shape.
- **Pros**: Smallest useful behavior, strict CLI surface, and no speculative generic type system.
- **Cons**: Future record types will require their own command additions.
- **Why chosen**: Only evidence registration is needed now.

### Option B: Add generic `cases add <type>`

- **Approach**: Add a generic add command with a closed accepted type list, initially containing only `evidence`.
- **Pros**: Could reduce future command-shape churn.
- **Cons**: It creates a generic command surface before another type exists and requires type-dispatch rules now.
- **Why not chosen**: A generic command fails the necessary-or-remove-it test for the current outcome.

### Option C: Extend `cases add document`

- **Approach**: Add `casegraph cases add document <case-id> evidence <path-to-file>`.
- **Pros**: Reuses the existing document command family.
- **Cons**: The user-facing concept is evidence, not generic document registration, and the existing complaint-specific command is likely to be removed later.
- **Why not chosen**: It preserves an old command shape that is not the intended direction.

## Agreed Approach

Use Option A. Add `casegraph cases add evidence` as the first and only evidence registration path. The command creates one opaque-ID evidence node with the provided path and timestamps, and points the user to `casegraph cases report <case-id>` after success.

## Key Decisions

- Evidence node IDs are opaque local IDs.
- Evidence files are external and are not copied into the workspace.
- Validation is limited to existing, readable, regular files.
- File type is not inspected.
- The command does not infer what the evidence proves.
- Extra positional tokens are hard errors.
- Omitted case ID follows the existing exactly-one-valid-case rule.

## Open Questions

None for this proposal.
