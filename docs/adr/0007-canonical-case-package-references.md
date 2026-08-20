# ADR 0007: Workspace Home And Package-Path References

## Status

Accepted.

## Context

CaseGraph must work with case material that already exists outside the
CaseGraph repository. One case may use a canonical case folder, a shared
authority library, produced records, and other independently maintained
packages. Requiring those materials to be copied into one repository or
reorganized into folders by content type would create duplication and make the
canonical source unclear.

ADR 0006 establishes `root.yaml` as the default canonical entry point for a
package folder. CaseGraph now has a concrete need to find packages across
external folders, choose an unambiguous owner for new case-specific files, and
avoid treating a search location as permission to write.

## Decision

### Identify one workspace-home package

Each case workspace identifies one workspace-home package by directly
referencing its canonical entry point, normally `root.yaml`.

The directory containing that `root.yaml` is the default writable home for new
CaseGraph-owned, case-specific files. A command that needs to create such a
file must fail before writing when the workspace-home entry point is missing or
invalid or its containing directory is not writable.

The exact workspace configuration field name remains undecided.

### Resolve packages through an ordered package path

A workspace may declare an ordered package path. Each package-path entry is a
directory used as a search root. It does not describe what type of material the
directory contains and does not need a type label such as `sources`, `indexes`,
or `authorities`.

A relative package reference is resolved by testing the referenced relative
folder beneath each package-path entry for a valid canonical package entry
point, normally `root.yaml`.

For example, a reference to:

```text
cases/Hanks-v-Rogers
```

may resolve to:

```text
<package-path-entry>/cases/Hanks-v-Rogers/root.yaml
```

A package-path entry points to a search-root directory, not to a `root.yaml`.
The workspace home points directly to a `root.yaml` because it identifies one
specific package.

CaseGraph must not silently choose the first match when the same relative
package reference resolves under more than one package-path entry. Ambiguous
resolution fails and reports every matching package.

Resolution of an explicit relative package reference does not require
recursive scanning of unrelated directories.

### Detect package traversal cycles

Package loading must detect cycles in package inclusion, import, or child
traversal and report the reference chain, such as:

```text
A -> B -> C -> A
```

Repeated use of one already completed dependency is not a cycle and may be
deduplicated. This rule applies to package traversal. It does not prohibit
cycles in legal-effect graph relationships where the applicable graph contract
allows them.

### Separate search from write authority

Package-path order never selects a write destination. Appearing on the package
path and being writable by the operating system do not authorize CaseGraph to
modify a package.

A resolved package must expressly opt into CaseGraph-managed writes through
its canonical entry point and governing package contract. CaseGraph validates
that authorization before creating or changing a sidecar or derived artifact.

CaseGraph may write case-independent artifacts into an expressly authorized
shared package. Case-specific facts, comparisons, claim relationships,
fair-warning applications, legal-effect edges, filing uses, and strategy
decisions belong in the workspace-home package.

## Non-Decisions

This ADR does not define:

- the exact workspace configuration envelope or field names
- the final logical package-reference string grammar
- CLI command names or argument syntax
- package-specific write-authorization syntax
- package identity fields beyond the canonical entry-point requirement
- remote, database, or non-filesystem package resolution
- automatic synchronization among package roots

Those behaviors require an OpenSpec change before implementation.

## Consequences

CaseGraph can use external case and shared packages without reorganizing them
by type or copying them into the CaseGraph repository.

The workspace home gives mutation commands one predictable case-specific owner,
while the package path provides extensible read resolution.

Shared packages can accumulate reusable case-independent artifacts without
receiving case-specific legal analysis. Search-root configuration never grants
silent write permission.
