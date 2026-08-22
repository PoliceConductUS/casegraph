# ADR 0010: CaseHome Resource Identity And Storage

## Status

Accepted.

Supersedes ADR 0002.

## Context

ADR 0002 used IDs that were unique only within one case workspace and stored
nodes as flat YAML files. CaseGraph now needs stable references that can move
through traversal APIs, filing packets, docket reconciliation, authored
documents, and external packages without combining a case ID, a resource type,
and a local filename.

Graph resources can also own more than one file. A document may own source and
rendered files. A docket entry may own downloaded court files. A resource may
own audit reports. A flat YAML file cannot provide a uniform ownership boundary
for those artifacts.

## Decision

A CaseFolder is the user-selected outer directory for one legal matter. It may
contain sources, filings, discovery, data requests, and other material that is
not owned by CaseGraph. A CaseFolder is machine-local organization and is not
the canonical case identity or a required Git repository.

A CaseHome is the `casegraph/` child of a CaseFolder:

```text
<case-folder>/casegraph/
```

The CaseHome is a Git repository containing one case graph. The surrounding
CaseFolder is not part of that repository. Every graph node and edge has an
identifier that is globally unique across the same identifier namespace. Nodes
and edges do not have separate identifier namespaces.

The CaseHome root resource remains:

```text
<casehome>/root.yaml
```

Therefore, from the surrounding CaseFolder, the same resource is:

```text
<case-folder>/casegraph/root.yaml
```

Machine-local registration maps the canonical public case ID to the canonical
absolute path of that `root.yaml`, not merely to the CaseFolder or CaseHome
directory. Reading the registered file validates both the selected CaseHome
and its root resource without guessing a filename.

Every other node or edge is a resource folder named only by its globally unique
ID:

```text
<casehome>/
  root.yaml
  config.yaml
  casegraph.lock.yaml  # when dependencies have been resolved
  <resource-uid>/
    root.yaml
    files/
    audits/
```

`files/` and `audits/` exist only when the resource owns such artifacts. Other
resource-owned paths require a concrete resource contract. CaseGraph does not
create `nodes/`, `edges/`, or kind-specific storage trees. The `kind` inside the
strict ADR 0009 envelope identifies the resource kind.

`config.yaml` is portable CaseHome configuration rather than a graph resource,
as defined by ADR 0016. `casegraph.lock.yaml` records deterministic dependency
resolution. Neither file changes the authority of `root.yaml` as the CaseHome
root resource.

For every non-root graph resource:

- the folder name equals `metadata.uid` in its `root.yaml`
- `root.yaml` is the authoritative resource entry point
- owned files are found through typed properties in `spec`, not by directory
  scanning
- references to other graph resources store globally unique IDs
- the schema determines whether content is a resource field or an owned file;
  file size never determines storage

A globally unique ID resolves without first knowing whether the resource is a
node or an edge. Its validated envelope supplies that distinction after
resolution.

Ordinary package folders that are not graph resources continue to follow ADR 0006. This ADR narrows ADR 0006 for graph resources: their entry point is always
`root.yaml`, and their folder identity follows the rules above.

## Non-Decisions

This ADR does not define:

- the ID generation algorithm
- a human-readable alias system
- the complete machine-local registration schema
- resource-kind schemas
- the filenames owned by a document or docket entry
- automatic recursive discovery of resource folders
- database storage
- remote resource resolution

## Consequences

Any graph reference can carry one ID without a case-local composite key or a
node-versus-edge discriminator. A resource has one folder that can own its YAML
record and related files without introducing type-separated storage.

Existing flat node files and case-local IDs are not the target architecture.
Their migration requires a separate OpenSpec change and test-backed command.

Keeping the CaseHome repository inside the broader CaseFolder lets the graph be
cloned, reviewed, and versioned without implicitly placing all surrounding case
material in the same Git repository.
