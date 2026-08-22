# ADR 0002: Filesystem-Scoped Graph Node Identity

## Status

Superseded by ADR 0010.

## Context

CaseGraph starts with repo-local case workspaces under:

```text
./workspace/<case-id>
```

Each case workspace will eventually hold an auditable case graph. At the first command stage, there is no database, persistence abstraction, graph mutation command, or complete graph file format.

The first useful graph item is the case itself. That item should be represented without creating duplicate metadata files or requiring global node identifiers before global identity is needed.

The workspace folder already scopes the case graph. This makes it possible for different case workspaces to use the same local node identifiers without conflict.

## Decision

A new case workspace will contain a root graph node file:

```text
workspace/<case-id>/root.yaml
```

`root.yaml` is the first graph node and represents the case itself.

The initial root node shape is:

```yaml
type: node
kind: case
id: root
created_at: "2026-05-12T02:30:00Z"
updated_at: "2026-05-12T02:30:00Z"
```

Unknown values are omitted from YAML files. Do not write `null` placeholders for unknown case information.

Node IDs are unique within a case workspace, not globally.

For graph node files, the file name stem must match the node ID. For example:

```text
root.yaml -> id: root
```

The case workspace folder scopes node identity. This allows every case graph to have `id: root` without global ambiguity. It also allows a case workspace to be copied or duplicated for experiments without rewriting internal root node identity.

## Non-Decisions

This ADR does not define:

- the full graph storage format
- a database or persistence abstraction
- a separate `case.yaml` manifest
- edge files
- source files
- graph mutation commands
- final schema validation mechanics beyond the file-name/id invariant

Those decisions should be made only when a concrete workflow requires them.

## Consequences

The first workspace contains a minimal graph root immediately.

The root case node has a stable local identity:

```text
id: root
```

Node lookup can use a simple filesystem convention:

```text
workspace/<case-id>/<node-id>.yaml
```

Future database persistence can preserve the same identity model with a natural key such as:

```text
(case_id, node_id)
```

If a separate workspace manifest becomes useful later, `case.yaml` can be added without changing the root node convention.
