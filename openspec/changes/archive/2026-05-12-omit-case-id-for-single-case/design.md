## Context

CaseGraph currently requires `<case-id>` for commands that operate on an existing case. ADR 0003 explicitly allows future command-specific alternate shapes that omit `<case-id>` when specified and tested. The user wants the convenience of omitting the case ID when the repository contains only one case, without adding a durable default/current-case concept.

The current implemented existing-case command is:

```bash
casegraph cases add document <case-id> complaint <path-to-pdf>
```

This change extends that command only.

## Goals / Non-Goals

**Goals:**

- Allow `casegraph cases add document complaint <path-to-pdf>` when exactly one valid case exists.
- Define a valid case as `workspace/<case-id>/` with an existing, valid `root.yaml` root case node.
- Preserve the explicit form `casegraph cases add document <case-id> complaint <path-to-pdf>`.
- Fail clearly when zero valid cases exist.
- Fail clearly when multiple valid cases exist and list the available case IDs.
- Keep unexpected extra positional tokens as hard errors.
- Keep omitted-case behavior command-specific and tested.

**Non-Goals:**

- Do not add `casegraph cases default`, `casegraph cases current`, or `casegraph cases use`.
- Do not create a default-case pointer, current-case file, manifest, or other persistent selection state.
- Do not make `<case-id>` optional globally for all current or future commands.
- Do not treat arbitrary directories under `workspace/` as valid cases.
- Do not change complaint document YAML shape or PDF validation rules.

## Decisions

The omitted-case form should be parsed as an explicit alternate shape for complaint document recording:

```bash
casegraph cases add document complaint <path-to-pdf>
```

This is intentionally not a global parser fallback. The parser should decide between the explicit shape and omitted-case shape by token count and position. Any unexpected token count remains a hard error.

Case resolution should happen before complaint PDF validation for the omitted-case form. If the user did not provide a case ID, the command first needs to know whether a case can be resolved at all. If no valid case exists, the error should point to `casegraph cases new <case-id>`. If more than one valid case exists, the error should list the available case IDs and require the explicit form.

A valid case is not merely a folder. The resolver should only count entries under `workspace/` where:

- the entry is a directory,
- `root.yaml` exists,
- `root.yaml` has `type: node`,
- `root.yaml` has `kind: case`,
- `root.yaml` has `id: root`.

The implementation can keep this validation narrow and structural. It does not need a full YAML schema engine or new dependency. The current node files are small and deterministic, so direct parsing consistent with existing YAML serialization is enough for this change.

When exactly one valid case exists, the command should behave exactly as if the user had supplied that case ID. All existing complaint safeguards still apply: existing case requirement, duplicate complaint rejection, PDF exists/readable/PDF validation, no copy/import/parse/hash, no edges, and no parent field.

## Risks / Trade-offs

- [Risk] Omitted-case mutation could affect the wrong case if case discovery is too loose. -> Mitigation: count only valid cases with valid `root.yaml`; fail when there is more than one.
- [Risk] Stray directories under `workspace/` could make output confusing. -> Mitigation: do not count them as cases; optionally mention invalid entries only if implementation already has a simple way to do so.
- [Risk] This introduces a convenience path that future commands may copy too broadly. -> Mitigation: specify and test omitted-case behavior command by command.
- [Risk] Direct root node validation could grow into a generic schema system. -> Mitigation: validate only the root fields needed to identify a valid case.

## Migration Plan

No data migration is required. Existing explicit commands remain valid. The new omitted-case form is additive.

Rollback is removing the omitted-case parser branch and resolver tests; no persisted data shape changes are introduced.

## Open Questions

None.
