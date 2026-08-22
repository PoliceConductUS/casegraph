# External Case Package Paths

## Outcome

A user creates or imports a case by selecting its home directory. CaseGraph
records only a typed local locator under `~/.casegraph/`, while authoritative
case files and package-path configuration live in the selected case home.

## Alternatives considered

### Repo-local attachment descriptor

Store a descriptor under the CaseGraph repository's ignored `workspace/`
folder and add a separate `cases attach` command.

This would preserve the existing repository-relative discovery model, but it
would make the repository checkout the anchor for every case and introduce a
second case-attachment action when `cases new` and imports already create cases.

### Put machine-local discovery state only in the case home

Require callers to pass the case home on every command and store `packagePath`
only in the case home's `root.yaml`.

This keeps the case package self-describing, but it does not let CaseGraph
reopen a case by ID without repeated manual path handling.

### Global locator plus self-describing case home

Store a `CaseLocator` envelope at `~/.casegraph/<case-id>/root.yaml`. Store
`packagePath` in the authoritative `CaseHome` envelope at the case home's
`root.yaml`.

This is the adopted approach. It provides stable lookup without moving case
content into CaseGraph. It also keeps the ordered package path with the package
contract that uses it.

## Agreed document model

Every CaseGraph YAML document is a well-defined Kubernetes-style envelope with
`apiVersion`, `kind`, `metadata.name`, and `spec`. This change introduces only:

- `policeconduct.org/casegraph/v1alpha1`, `CaseLocator`
- `policeconduct.org/casegraph/v1alpha1`, `CaseHome`

Each type has one strict reader/writer that owns its complete schema. CaseGraph
does not use an untyped YAML reader, a generic permissive envelope, or a legacy
fallback for either document.

## Agreed command design

```text
casegraph cases new <case-id> --home <directory> [--yes]

casegraph cases import courtlistener <docket-id> \
  --home <directory> --write [--yes]

casegraph packages add <case-id> <path>...
```

`--home` is mandatory for case creation and write imports. CaseGraph prompts
before creating a missing home directory or a missing `root.yaml`; `--yes`
approves those creation prompts for non-interactive use. A nonempty existing
directory without `root.yaml` is rejected.

`packages add` accepts one or more search-root directories, validates the whole
batch, rejects duplicates, and appends the paths atomically in supplied order.

## Loading and repair

Every command that loads a case reads the `CaseLocator` locator, reads the
home `CaseHome`, resolves every `spec.packagePath` entry, and verifies that
each entry is an existing directory. Relative entries resolve from the case
home.

When an entry cannot be located in an interactive session, CaseGraph prompts
for a replacement and shows the exact `CaseHome` change before writing it.
If the session is non-interactive or the user declines, CaseGraph fails before
the requested case operation.

## Write authority

Selecting `--home` makes that case home the owner of CaseGraph-created
case-specific files, subject to a valid `CaseHome` and filesystem write
permission.

A directory on `spec.packagePath` remains read-only to CaseGraph. For now, a
shared package can become eligible for managed writes only through a future
manual edit to that package's own canonical `root.yaml`. Issue 14 will add and
enforce the exact typed field. This change adds no authorization field or
command and never infers authority from filesystem permissions or package-path
order.
