# ADR 0006: Package Folder Entry Points

## Status

Accepted.

## Context

CaseGraph stores related case material in folders. A folder may represent a
case, analysis run, workflow, task run, authority, event, source collection, or
another package of related material. A person or tool needs one predictable
place to begin understanding a package without relying on ad hoc directory
scanning.

Existing case and analysis conventions already use `root.yaml` in several
roles. The case workspace root is a graph node. Current-analysis and workflow
roots are authoritative package entry points. The contents differ because the
packages serve different purposes.

CaseGraph does not yet need one universal package schema or a requirement that
every directory in the repository be a package.

## Decision

A CaseGraph package is a folder that groups related material around one purpose.
The default entry point for a package folder is:

```text
root.yaml
```

The package's concrete contract determines how `root.yaml` identifies the
package's type or purpose, records authoritative state, and references other
package contents. A root may itself be a graph node, a package manifest, or
another authoritative record appropriate to that package.

`root.yaml` is a default convention, not an invariant for every directory.
Folders that are not packages do not require a root. A package may deviate from
the default when a concrete requirement establishes a different authoritative
entry point. The deviation should be explicit and discoverable from the
containing package or another governing convention.

Supporting files are discovered through the package entry point when the
package contract requires authoritative membership. Directory presence alone
does not make an unreferenced file authoritative.

A package folder may contain child package folders. Each child package has its
own canonical entry point and contract. Nesting a folder does not make it an
authoritative child package by itself; the governing package reference or
contract must identify it as one.

## Non-Decisions

This ADR does not define:

- one schema shared by every `root.yaml`
- a required package-type field
- which future graph concepts require their own package
- whether every event, source, fact, authority, or document is a package
- recursive package indexing behavior
- package validation commands
- package inheritance or ownership semantics
- logical package reference syntax
- database or non-filesystem package storage

Those decisions should be made only when a concrete package needs them.

## Consequences

New package-oriented features have a predictable default entry point without
forcing unrelated directories or package kinds into one schema.

Different packages may use different root contracts while remaining
discoverable through the same filename convention.

Exceptions remain possible, but they must be explicit rather than silently
introducing another entry-point convention.
