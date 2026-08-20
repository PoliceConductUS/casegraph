## 1. Test Single-Case Resolution

- [x] 1.1 Add acceptance coverage that `casegraph cases add document complaint <path-to-pdf>` records the complaint for the only valid case.
- [x] 1.2 Add acceptance coverage that a case is valid only when `workspace/<case-id>/root.yaml` exists and contains `type: node`, `kind: case`, and `id: root`.
- [x] 1.3 Add acceptance coverage that stray `workspace/` directories and invalid root nodes are not counted as valid cases.
- [x] 1.4 Add acceptance coverage that omitted-case complaint recording fails when no valid case exists and tells the user to run `casegraph cases new <case-id>`.
- [x] 1.5 Add acceptance coverage that omitted-case complaint recording fails when multiple valid cases exist, lists the available case IDs, and requires explicit `<case-id>`.
- [x] 1.6 Add acceptance coverage for the end-to-end transition: create one case, add a complaint with omitted `<case-id>`, create a second case, then verify another omitted-case complaint command is rejected and requires explicit `<case-id>`.
- [x] 1.7 Add acceptance coverage that extra positional tokens in the omitted-case complaint command are hard errors.

## 2. Implement Explicit Omitted-Case Command Shape

- [x] 2.1 Add parser handling for exactly `cases add document complaint <path-to-pdf>` without changing the existing explicit `<case-id>` shape.
- [x] 2.2 Implement valid-case discovery from `workspace/<case-id>/root.yaml`.
- [x] 2.3 Resolve the omitted-case form only when exactly one valid case exists.
- [x] 2.4 Preserve existing complaint document validation, duplicate prevention, YAML output, and next-step guidance after resolution.
- [x] 2.5 Return clear no-case and multiple-case errors before complaint PDF validation when `<case-id>` is omitted.
- [x] 2.6 Ensure no default/current/use file, manifest, or durable selection record is created.

## 3. Validate

- [x] 3.1 Run focused CLI tests for omitted-case complaint recording.
- [x] 3.2 Run `npm run validate`.
- [x] 3.3 Run `npm run openspec:validate`.
