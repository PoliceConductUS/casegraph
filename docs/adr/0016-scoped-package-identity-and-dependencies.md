# ADR 0016: Scoped Package Identity And Dependencies

## Status

Accepted.

## Context

CaseGraph CaseHomes must remain portable when stored in source control. A
CaseHome may depend on independently maintained docket, filing, recording,
authority, personnel, training, policy, discovery, and other packages. Those
packages may occupy different filesystem locations on different machines.

ADR 0006 establishes `root.yaml` as the canonical package entry point. ADR 0007
establishes that the CaseHome owns an ordered package path, ambiguous resolution
fails, and package-path presence does not grant write authority. ADR 0008
establishes package-relative artifact sidecars and provenance.

ADR 0007 originally used a relative folder name as the logical package
reference. That couples a portable reference to one physical folder layout.
CaseGraph instead needs a stable scoped package identity, shared dependency
configuration, exact content locking, and machine-independent artifact
references.

Package semantic versions are not needed for the current local-package outcome.
Git owns CaseHome history under ADR 0011, and the package lock can identify the
exact resolved package content by UID and digest without adding another version
field.

## Decision

### Give every package configuration a scoped identity

Every package contains both its canonical `root.yaml` entry point and a
`config.yaml`. The root is a graph resource governed by ADR 0009 and ADR 0010.
The configuration is a separate Kubernetes-style envelope that defines the
portable package identity and dependency configuration:

```yaml
apiVersion: casegraph.policeconduct.org/v1alpha1
kind: PackageConfig
metadata:
  name: "@example-case/federal-docket"
  uid: "tz4a98xxat96iws9zmbrgj3a"
spec:
  dependencies: {}
```

The identity fields have separate purposes:

- `apiVersion` selects the package-configuration schema reader and writer.
- `metadata.name` is the human-readable scoped package name in the form
  `@scope/name`.
- `metadata.uid` is a CUID2 that permanently identifies the package lineage,
  including across a rename.

The configuration envelope is not a graph resource and does not join graph
membership. It has no `metadata.version`. Graph resources, including the
package's `root.yaml`, also gain no package-version field. ADR 0011 remains the
only CaseHome history model.

The configuration UID must equal the owning `root.yaml` resource UID so the
package identity and canonical root identify one lineage. Two available
packages with the same scoped name but different UIDs conflict. Reusing one UID
for different package lineages also conflicts. CaseGraph reports either
conflict rather than guessing.

### Use one shared dependency model

CaseHome and non-CaseHome package configurations use the same dependency
representation: a mapping from scoped package name to a package selector. The
only supported selector is the literal string `latest`.

```yaml
apiVersion: casegraph.policeconduct.org/v1alpha1
kind: PackageConfig
metadata:
  name: "@example-case/proposed-amended-complaint"
  uid: "n8m2y4v6k9p3q7r5s1t0w2x4"
spec:
  dependencies:
    "@example-case/federal-docket": latest
    "@shared/fifth-circuit-authorities": latest
```

The configuration field is named `dependencies`, not `imports`. A dependency
makes another package available for resolution. It does not import every
resource from that package into the case graph.

CaseGraph rejects any selector other than `latest`. It does not silently ignore
or approximate semantic-version ranges that it cannot enforce. Supporting
additional selectors requires a later explicit package-release decision.

`PackageConfig` and `CaseHomeConfig` share package identity and dependency
contracts. `CaseHomeConfig` additionally owns the package path used for
resolution. A dependency package cannot add, replace, or reorder CaseHome
package-path entries.

The complete kind-specific configuration schemas are product behavior that
must be specified in OpenSpec before implementation.

For a CaseHome, the configuration path is exactly
`<case-folder>/casegraph/config.yaml`, alongside the CaseHome root at
`<case-folder>/casegraph/root.yaml`. Machine-local registration points to the
root file; it does not replace or duplicate the portable configuration.

### Resolve identities independently of physical layout

A resolver accepts a scoped package name and selector, rejects selectors other
than `latest`, and searches only packages made available through the selected
CaseHome's package path or explicit local package registration. It validates
each candidate's canonical entry point and package-configuration metadata.

Physical folder names do not have to contain the package name or UID. The same
package may therefore live at different paths on different machines. The
resolver must produce exactly one package with the requested scoped name.
Missing, invalid, conflicting, or ambiguous resolution fails with diagnostics
that identify the requested name and every relevant candidate.

Package-path order defines a search sequence but never authorizes first-match
shadowing. Multiple matches remain ambiguous even when one appears earlier.
Resolution does not require recursive scanning of unrelated directories.

Concrete machine-specific package locations are resolution state, not portable
package identity. Portable package configuration and graph resources must not
store resolved absolute filesystem paths. The exact storage contract for local
package registration remains an OpenSpec decision.

### Keep artifact paths package-relative

A cross-package artifact reference identifies the dependency package by its
scoped name and the target by a path relative to the resolved package root:

```yaml
source:
  package: "@example-case/federal-docket"
  path: "030/document-1.pdf"
```

The CaseHome lock identifies the exact package UID and content digest used for
resolution. Resource references do not repeat machine-specific locations,
CUID2 values, or content digests in every path.

Resolving an artifact path that escapes its package root fails. Resolving a
package does not make all of its resources part of the case graph. Resources
join the graph only through the CaseHome root and schema-declared typed
references.

### Lock exact dependency resolutions

CaseGraph records successful dependency resolution in deterministic
`casegraph.lock.yaml`. Each locked package records:

- scoped package name
- requested selector, currently always `latest`
- CUID2 UID
- deterministic content digest
- dependency relationships needed to reproduce and diagnose the resolution

The lock file contains no machine-specific absolute paths. Re-resolving
unchanged configuration and package contents produces byte-identical lock
content. A digest mismatch reports changed package content rather than silently
accepting it as the locked content. Failed resolution does not partially
replace a valid lock.

### Separate installation from acquisition

CaseGraph needs two local installation operations:

```text
casegraph install <case-id> <package>@latest
casegraph install <case-id>
```

The first declares one direct scoped-name dependency with the `latest` selector
and resolves the dependency closure. The second resolves all dependencies
already declared by
the CaseHome. Both operate only on packages available through the CaseHome
package path, update configuration and locking atomically as applicable, and do
not download, copy, move, or modify dependency packages.

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

CaseHomes can be committed and cloned without embedding package locations from
the machine where they were created. Package producers may organize folders
without encoding identity into the directory tree. Dependencies retain a
package.json-like name-to-selector shape, while the lock preserves exact
UID-and-digest reproducibility and detects changed content.

The resolver, installer, and doctor require strict package identity and a
deterministic digest contract. Existing relative-folder references require an
explicit migration when the corresponding OpenSpec change is implemented; no
backward-compatibility behavior is implied.

Registry lookup, package download, package-release selectors, S3 access, and
other remote resolution are not part of this decision. A future ADR may add
them when a concrete outcome requires them.

## Alternatives Considered

### Keep relative folder names as package identity

Rejected because a folder location is not stable across machines.

### Add package semantic versions now

Rejected because the current local-package workflow needs exact identity and
content verification, both supplied by the UID and lock digest. A version field
would add a second freshness signal without a current registry or release
selection workflow.

### Accept but ignore arbitrary selectors

Rejected because accepting a selector that CaseGraph does not enforce would
make the configuration claim a constraint that resolution silently violates.

### Put the UID or digest in every artifact path

Rejected because it makes references noisy, couples resource addressing to a
storage layout, and duplicates information already held by the lock.

### Call dependency declarations imports

Rejected because `imports` implies graph membership or namespace exposure.
Declaring a package dependency only makes typed cross-package references
resolvable.

### Select the first package-path match

Rejected because silent shadowing makes resolution depend on local path order
and can bind legal analysis to the wrong source package.

### Add a remote registry now

Rejected because current packages are local and no current outcome requires
network acquisition or infrastructure.

## Revisit Triggers

Revisit this decision when CaseGraph has a concrete need for a shared package
registry, remote package acquisition, S3-backed packages, or explicit package
release selection.
