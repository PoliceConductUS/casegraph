## Design Summary

Allow existing-case commands to define an explicit alternate shape that omits `<case-id>` only when exactly one case exists.

For this change, the first command to opt in is complaint document recording:

```bash
casegraph cases add document <case-id> complaint <path-to-pdf>
casegraph cases add document complaint <path-to-pdf>
```

The omitted-case form is valid only when the repository contains exactly one valid case. A valid case is a `workspace/<case-id>/` directory whose `root.yaml` exists and is a valid root case node. Stray folders under `workspace/` are not cases.

When no valid case exists, the omitted-case form fails with guidance to create a case. When more than one valid case exists, the omitted-case form fails with guidance to provide `<case-id>` explicitly and lists the available case IDs. The command must not create a default/current-case file or any persistent case selection.

## Alternatives Considered

### Option A: Infer case ID only when exactly one valid case exists

- **Approach**: Add command-specific optional argument handling. If `<case-id>` is omitted, enumerate valid cases from repo-local case workspaces and proceed only when the count is exactly one.
- **Pros**: No hidden persistent state, no default/current-case concept, low ambiguity, and aligned with ADR 0003's allowance for command-specific omitted-case forms.
- **Cons**: Users with multiple cases still need to type `<case-id>`.
- **Why chosen**: This is the smallest convenience that does not introduce durable global state or ambiguous mutation behavior.

### Option B: Add `casegraph cases default` commands

- **Approach**: Add `casegraph cases default`, `casegraph cases default set <case-id>`, and maybe `casegraph cases default clear`, then let commands omit `<case-id>` by reading the default.
- **Pros**: Useful once multiple active cases exist and the user usually works in one.
- **Cons**: Adds persistent state, raises questions about where the default is stored, whether it is committed, and which commands may rely on it.
- **Why not chosen**: It is more product surface than needed for the immediate single-case workflow.

### Option C: Add `casegraph cases use <case-id>`

- **Approach**: Add a command that sets a "current" case for later commands.
- **Pros**: Familiar session-like UX.
- **Cons**: CLI processes do not naturally preserve session state, so this would still need a persistent file while sounding temporary.
- **Why not chosen**: The name implies session state, but the implementation would be durable state. That mismatch is too easy to misunderstand.

## Agreed Approach

Use Option A.

This change should not add a default case, current case, `cases use`, or durable selection file. It should add exact optional forms command by command, starting with complaint document recording. The implementation may use a shared resolver internally, but only the explicitly specified command shape should use it.

## Key Decisions

- Say "exactly one case exists" in product behavior.
- Define "case exists" as a valid case directory under `workspace/<case-id>` with an existing, valid `root.yaml` root case node.
- Treat stray directories under `workspace/` as invalid case candidates, not as cases.
- If zero valid cases exist, fail before validating complaint PDF details and tell the user to run `casegraph cases new <case-id>`.
- If multiple valid cases exist, fail before validating complaint PDF details, list available case IDs, and tell the user to rerun with `<case-id>`.
- Preserve the existing explicit command shape.
- Do not add default/current/use behavior.
- Do not add optional omitted-case behavior to every command globally.
- Keep extra positional tokens as hard errors.

## Open Questions

None for the initial scope.
