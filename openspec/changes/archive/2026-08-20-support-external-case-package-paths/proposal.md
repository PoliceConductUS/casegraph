## Why

CaseGraph currently creates case workspaces only inside its repository. Case
materials already have canonical folders elsewhere, so requiring a copy under
`workspace/<case-id>` duplicates data and obscures ownership. A case should be
reopenable by ID while its authoritative files remain in a user-selected home.

## What Changes

- Require `--home <directory>` when `cases new` or a CourtListener write import
  creates a case.
- Prompt before creating a missing home directory or case `root.yaml`, with
  `--yes` for explicitly authorized non-interactive creation.
- Store a strict `CaseLocator` envelope at
  `~/.casegraph/<case-id>/root.yaml`.
- Store the ordered `spec.packagePath` in the authoritative `CaseHome`
  envelope at the case-home `root.yaml`.
- Give each `apiVersion`/`kind` pair one strict reader/writer.
- Load existing cases through the locator and validate the home and every
  package-path entry before any case operation.
- Prompt an interactive user to replace a missing package-path entry and fail
  before the operation when the path cannot be repaired.
- Add `casegraph packages add <case-id> <path>...` for atomic ordered additions.
- Keep package-path entries read-only; shared-package write opt-in remains a
  future manual package-root edit whose exact typed field belongs to Issue 14.

## Capabilities

### New Capabilities

- `case-packages`: Manage the ordered package search roots declared by a case.

### Modified Capabilities

- `case-workspaces`: Create, locate, load, and validate externally housed case
  workspaces.
- `courtlistener-import`: Require an explicit case home for write imports.

## Non-goals

- Do not copy case package contents into the CaseGraph repository.
- Do not add package-reference resolution; Issue 8 owns that behavior.
- Do not add case list, show, validate, or resolve commands; Issue 6 owns those
  command surfaces.
- Do not add shared-package write authorization fields or commands; Issue 14
  owns that behavior.
- Do not add remote, database, cloud, synchronization, backup, or encryption
  behavior.
- Do not accept untyped YAML, unknown envelope fields, or the old implicit
  repo-local root shape.

## Impact

- `cases new` and CourtListener write imports become explicit-home operations.
- Existing case commands use one shared workspace loader instead of joining
  `cwd/workspace/<case-id>` directly.
- The local locator contains only the typed case ID and canonical case-home
  entry point; case data remains outside `~/.casegraph/`.
- The implementation adds the current stable `yaml` package for strict parsing
  and typed document updates.
