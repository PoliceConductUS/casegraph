# External Case Package Paths Design

## Context

ADR 0006 establishes `root.yaml` as the default canonical package entry point.
ADR 0007 requires one workspace-home entry point, treats package-path entries as
search roots rather than write destinations, and forbids package-path order from
selecting an owner for writes. ADR 0008 requires versioned Kubernetes-style
envelopes and strict kind-specific schemas.

The current implementation instead derives every case from
`<cwd>/workspace/<case-id>/root.yaml` and uses an unversioned graph-node shape
for that root. This change replaces that implicit home with an explicit
user-selected package and a typed machine-local locator.

## Goals / Non-goals

**Goals:**

- Require an explicit home directory for new and imported cases.
- Create a missing home directory and root only after confirmation.
- Reopen a case by ID without copying case content.
- Keep package-path configuration in the authoritative case package.
- Validate the complete workspace contract before every case operation.
- Repair missing package paths only through an explicit interactive choice.
- Add ordered, atomic package-path additions.
- Give every document type one strict schema-aware reader/writer.

**Non-goals:**

- Logical package-reference resolution.
- Package traversal or cycle detection.
- CLI list/show/validate/resolve commands.
- Shared-package write authorization fields or commands.
- A database, daemon, cloud service, or repository-local case copy.
- Legacy root-shape compatibility.

## Envelope contract

Every document in this change has these required top-level fields and rejects
unknown top-level or nested fields:

```yaml
apiVersion: policeconduct.org/casegraph/v1alpha1
kind: <document kind>
metadata:
  name: <document name>
spec: <kind-specific spec>
```

The `apiVersion` and `kind` select exactly one strict Zod schema. Each document
type has one module that owns reading, validation, mutation, and writing for
that type. Callers do not parse or serialize these documents directly.

## File contracts

### `CaseLocator`

`~/.casegraph/<case-id>/root.yaml` is a machine-local locator, not a case graph
and not a copy of the case package:

```yaml
apiVersion: policeconduct.org/casegraph/v1alpha1
kind: CaseLocator
metadata:
  name: example-v-example-city
spec:
  home: /cases/example-v-example-city/root.yaml
```

`metadata.name` is the case ID and must match the locator directory name.
`spec.home` is the canonical absolute path to the selected `CaseHome`
`root.yaml`. The locator directory and file are created only after the home
package passes validation. Existing locators are never overwritten by case
creation.

Production uses `path.join(os.homedir(), ".casegraph")`. Tests inject the
CaseGraph configuration-home directory.

### `CaseHome`

The selected case home's authoritative package entry point is:

```yaml
apiVersion: policeconduct.org/casegraph/v1alpha1
kind: CaseHome
metadata:
  name: example-v-example-city
spec:
  graphRoot:
    type: node
    kind: case
    id: root
  packagePath: []
  createdAt: "2026-08-20T00:00:00.000Z"
  updatedAt: "2026-08-20T00:00:00.000Z"
```

`metadata.name` is the case ID and must match the `CaseLocator` name.
`spec.graphRoot` preserves the root graph-node identity established by ADR 0002. `spec.packagePath` is an ordered string list. Relative entries resolve
from the directory containing this `root.yaml`; absolute entries are allowed.
The timestamps are ISO timestamps and match when the package is first created.

The `CaseHome` schema contains no managed-write authorization field in this
change. Issue 14 must change this type's schema before such a field can be
manually added and accepted.

## Single reader/writer per type

`src/cases/workspaces/case-locator-document.ts` is the only module permitted
to read or write `CaseLocator` documents.

`src/cases/workspaces/case-home-document.ts` is the only module permitted to
read or write `CaseHome` documents, including `spec.packagePath` updates.

Both readers use `yaml@2.9.0` `parseDocument`, reject YAML parse errors, convert
the document to a value, and apply their own strict Zod schema. Both writers
construct or update only their owned document kind and validate the resulting
document before replacement. There is no generic envelope reader/writer and no
fallback for legacy shapes.

The `CaseHome` writer uses the YAML Document API for package-path mutations
so comments and presentation are retained. It writes a sibling temporary file,
reads and validates that file through the same `CaseHome` reader, and then
renames it over `root.yaml`.

## Shared workspace loader

Add a package-by-feature module under `src/cases/workspaces/` that exposes:

```ts
type CaseWorkspaceRuntime = {
  casegraphHome: string;
  approveCreation?: (request: CreationRequest) => Promise<boolean>;
  replaceMissingPackagePath?: (
    request: MissingPackagePathRequest,
  ) => Promise<string | undefined>;
};

type ResolvedCaseWorkspace = {
  caseId: string;
  locatorRoot: string;
  homeRoot: string;
  homeDirectory: string;
  packagePath: readonly string[];
  resolvedPackagePath: readonly string[];
};
```

`loadCaseWorkspace` validates, in order:

1. The locator is a valid `CaseLocator` whose `metadata.name` matches the
   requested case ID.
2. `spec.home` is an absolute path ending in `root.yaml`.
3. The home entry is a valid `CaseHome` with the same `metadata.name`.
4. The home directory is writable before a command declares a case-specific
   write destination.
5. Every `spec.packagePath` entry resolves to an existing directory.

The loader never substitutes the locator directory, current working directory,
or first package-path entry for a missing home.

## Creation and prompts

`cases new <case-id> --home <directory>` resolves the supplied home directory
from the current working directory.

- Missing directory: request approval, then create it recursively.
- Existing empty directory without `root.yaml`: request approval, then create
  the `CaseHome` exclusively.
- Existing nonempty directory without `root.yaml`: fail without mutation.
- Existing `root.yaml`: validate it as a `CaseHome` with a matching name; do
  not rewrite it.
- Existing locator: fail without changing the locator or home.

`--yes` answers only the missing-directory and missing-root creation prompts.
It does not repair package paths or authorize shared-package writes.

## Package-path editing

`casegraph packages add <case-id> <path>...` loads and validates the case first.
It resolves each supplied path from the invocation directory, requires every
resolved path to be a directory, converts it to a path relative to the case
home when possible, rejects duplicates by resolved identity, and appends the
entire batch to `spec.packagePath` in supplied order through the `CaseHome`
writer.

## Missing-path repair

When loading finds a missing `spec.packagePath` entry, an interactive runtime
may ask for a replacement. The replacement must resolve to an existing
directory and must not duplicate another entry. CaseGraph displays the old and
new stored values and requests confirmation before the `CaseHome` writer
atomically updates `root.yaml`.

Without an interactive replacement, or when the user declines, loading fails
and the requested operation does not run. The error identifies the case, home
root, missing entry, and the file requiring manual correction.

## Command migration

Commands that operate on an existing case receive the resolved home directory
from the shared loader. They no longer construct `cwd/workspace/<case-id>`.
Omitted-case discovery enumerates valid `CaseLocator` locators and validates
their associated `CaseHome` documents instead of scanning repository-local
folders.

Graph-record readers treat `spec.graphRoot` from the `CaseHome` as the root
graph node and continue to read the other graph-record YAML files owned by
their existing record contracts. No code outside the `CaseHome` writer
rewrites the package root.

CourtListener `--dry-run` remains non-mutating and does not require a home.
CourtListener `--write` requires `--home`; it creates the `CaseHome` and
`CaseLocator` through the same creation function used by `cases new`.

## Write authority

The selected case home is the only destination for case-specific writes.
Package-path entries are read-only in this change. Filesystem writability does
not opt a package into managed writes. Issue 14 will define the typed field that
the user may manually edit in a package's own envelope and will add its reader,
writer, and enforcement changes.

## Failure and rollback

All validation failures occur before the requested case operation. Creation may
create a user-approved empty directory before a later root write fails; the
error reports that directory and CaseGraph does not delete it automatically.

Rollback is reverting this issue branch. Existing external homes remain in
place; removing a machine-local locator never deletes its case home.
