# ADR 0016: Scoped Package Identity And Dependencies

## Status

Accepted.

## Context

CaseGraph CaseHomes must remain portable when stored in source control. A
CaseHome may depend on independently maintained docket, filing, recording,
authority, personnel, training, policy, discovery, and other packages. Those
packages may occupy different filesystem locations on different machines and
may eventually be obtained through a package registry or non-filesystem
storage.

ADR 0006 establishes `root.yaml` as the canonical package entry point. ADR 0007
establishes that the CaseHome owns an ordered package path, ambiguous resolution
fails, and package-path presence does not grant write authority. ADR 0008
establishes package-relative artifact sidecars and provenance.

ADR 0007 originally used a relative folder name as the logical package
reference. That couples a portable reference to one physical folder layout and
does not identify which package revision was used. CaseGraph instead needs a
stable package coordinate, npm-like dependency declarations, exact resolution
records, and machine-independent artifact references.

## Decision

### Give every package configuration a scoped coordinate

Every package contains both its canonical `root.yaml` entry point and a
`config.yaml`. The root is a graph resource governed by ADR 0009 and ADR 0010.
The configuration is a separate Kubernetes-style envelope that defines the
portable package coordinate and dependency configuration:

```yaml
apiVersion: casegraph.policeconduct.org/v1alpha1
kind: PackageConfig
metadata:
  name: "@example-case/federal-docket"
  uid: "tz4a98xxat96iws9zmbrgj3a"
  version: "1.2.3"
spec: {}
```

The identity fields have separate purposes:

- `apiVersion` selects the package-configuration schema reader and writer.
- `metadata.name` is the human-readable scoped package name in the form
  `@scope/name`.
- `metadata.uid` is a CUID2 that permanently identifies the package lineage,
  including across a rename.
- `metadata.version` is the semantic version of one immutable package revision.

The configuration envelope is not a graph resource and does not join graph
membership. Its `metadata.version` is a published package-release coordinate,
not graph history. Graph resources, including the package's `root.yaml`, do not
gain version fields; ADR 0011 remains the only CaseHome history model. The
configuration UID must equal the owning `root.yaml` resource UID so the package
coordinate and its canonical root identify one lineage.

Two packages with the same scoped name and version but different UIDs are in
conflict. Reusing one UID for different package lineages is also a conflict.
CaseGraph must report either conflict rather than guessing.

Once a package revision is locked, changing its authoritative content without
changing `metadata.version` produces a digest mismatch. CaseGraph reports the
revision as changed rather than silently accepting it as the locked revision.

### Use one shared dependency model

CaseHome and non-CaseHome package configurations use the same dependency
representation: a mapping from scoped package name to semantic-version
selector.

```yaml
apiVersion: casegraph.policeconduct.org/v1alpha1
kind: PackageConfig
metadata:
  name: "@example-case/proposed-amended-complaint"
  uid: "n8m2y4v6k9p3q7r5s1t0w2x4"
  version: "2.1.0"
spec:
  dependencies:
    "@example-case/federal-docket": "^1.2.0"
    "@shared/fifth-circuit-authorities": "4.1.0"
```

The configuration field is named `dependencies`, not `imports`. A dependency
makes another package available for resolution. It does not import every
resource from that package into the case graph.

`PackageConfig` and `CaseHomeConfig` share package identity and dependency
contracts. `CaseHomeConfig` additionally owns the package path used for
resolution. A dependency package cannot add, replace, or reorder CaseHome
package-path entries.

The complete kind-specific configuration schemas are product behavior that
must be specified in OpenSpec before implementation.

### Resolve coordinates independently of physical layout

A resolver accepts a scoped package name and semantic-version selector and
searches only packages made available through the selected CaseHome's package
path or explicit package registration. It validates each candidate's canonical
entry point and package-configuration metadata.

Physical folder names do not have to contain the package name, UID, or version.
The same package may therefore live at different paths on different machines.
The resolver must produce exactly one compatible package revision. Missing,
invalid, incompatible, or ambiguous resolution fails with diagnostics that
identify the requested coordinate and every relevant candidate.

Package-path order defines a search sequence but never authorizes first-match
shadowing. Multiple compatible matches remain ambiguous even when one appears
earlier. Resolution does not require recursive scanning of unrelated
directories.

Concrete machine-specific package locations are resolution state, not portable
package identity. Portable package configuration and graph resources must not
store resolved absolute filesystem paths. The exact storage contract for local
package registration remains an OpenSpec decision.

### Keep artifact paths package-relative

A cross-package resource reference identifies the dependency package by its
scoped name and identifies the target within that package using a path relative
to the resolved package root:

```yaml
source:
  package: "@example-case/federal-docket"
  path: "030/document-1.pdf"
```

The declaring package's dependency selector and the CaseHome lock determine the
exact dependency revision. Resource references do not repeat machine-specific
locations, CUID2 values, versions, or content digests in every path.

Resolving an artifact path that escapes its package root fails. Resolving a
package does not make all of its resources part of the case graph. Resources
join the graph only through the CaseHome root and schema-declared typed
references.

### Lock exact dependency resolutions

CaseGraph records successful dependency resolution in a deterministic
`casegraph.lock.yaml` using a versioned Kubernetes-style envelope. Each locked
package records:

- scoped package name
- requested version selector
- CUID2 UID
- exact semantic version
- deterministic content digest
- dependency relationships needed to reproduce and diagnose the resolution

The lock file contains no machine-specific absolute paths. Re-resolving
unchanged configuration and package contents produces byte-identical lock
content. Failed resolution does not partially replace a valid lock.

Package configuration preserves user-authored version selectors. The lock file
records the exact revisions selected from those selectors.

### Separate installation from acquisition

CaseGraph needs two local installation operations:

```text
casegraph install <case-id> <package>@<version-selector>
casegraph install <case-id>
```

The first declares one direct dependency and resolves the dependency closure.
The second resolves all dependencies already declared by the CaseHome. Both
operate only on packages available through the CaseHome package path, update
configuration and locking atomically as applicable, and do not download, copy,
move, or modify dependency packages.

CaseGraph also needs a read-only doctor operation that validates the CaseHome,
package path, dependency closure, and lock and reports actionable resolution
failures. Exact command behavior belongs in OpenSpec.

### Preserve explicit write authority

Package identity, dependency declaration, resolution, installation, and lock
membership grant no write authority. ADR 0007 continues to govern managed
writes: a package must expressly opt in through its canonical contract before
CaseGraph may modify it.

## Superseded Decision

This ADR supersedes only ADR 0007's rule that a relative folder name is the
logical package reference tested beneath each package-path entry. ADR 0007's
other decisions remain accepted.

## Consequences

CaseHomes can be committed and cloned without embedding the package locations
of the machine where they were created. Package producers may organize folders
without encoding identity into the directory tree. Dependency selectors remain
readable, while the lock preserves exact reproducibility and detects changed
content.

The resolver, installer, and doctor require strict package metadata and a
deterministic digest contract. Existing relative-folder references require an
explicit migration when the corresponding OpenSpec change is implemented; no
backward-compatibility behavior is implied.

Registry lookup, package download, S3 access, and other remote resolution are
not part of this decision. A future ADR may add them without changing scoped
package coordinates or package-relative artifact references.

## Alternatives Considered

### Keep relative folder names as package identity

Rejected because a folder location is not stable across machines and does not
identify a package revision.

### Put the UID and version in every artifact path

Rejected because it makes references noisy, couples resource addressing to a
storage layout, and duplicates information already held by dependencies and the
lock.

### Call dependency declarations imports

Rejected because `imports` implies graph membership or namespace exposure.
Declaring a package dependency only makes typed cross-package references
resolvable.

### Select the first compatible package-path match

Rejected because silent shadowing makes resolution depend on local path order
and can bind legal analysis to the wrong source package.

### Add a remote registry now

Rejected because current packages are local and no current outcome requires
network acquisition or infrastructure.

## Revisit Triggers

Revisit this decision when CaseGraph has a concrete need for a shared package
registry, remote package acquisition, S3-backed packages, or a version model
that semantic versioning cannot represent accurately.
