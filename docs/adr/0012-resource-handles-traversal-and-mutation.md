# ADR 0012: Resource Handles, Traversal, And Mutation Boundaries

## Status

Accepted.

## Context

CaseGraph skills and role agents need to inspect a bounded case graph without
receiving arbitrary filesystem access. Some tasks stop after finding one
resource. Others traverse a chronology, a claim path, a filing packet, or a
legal-effect path. Loading the entire CaseHome before either task would waste
memory and weaken the graph-access boundary.

The CLI can already provide a deterministic process boundary. Read traversal,
however, needs a proper programmatic API so every skill does not independently
parse YAML, resolve references, detect cycles, and choose traversal order.

## Decision

### Use one generic resource handle

CaseGraph exposes a `ResourceHandle` for any globally identified node or edge.
It is not split into `NodeHandle` and `EdgeHandle` classes.

A resource handle provides, at minimum:

- its globally unique ID
- `await resolve()`, which reads and validates the resource's complete
  `root.yaml`
- `release()`, which releases the resolved in-memory resource while preserving
  the handle's identity and ability to resolve again

References found in resolved properties become `ResourceHandle` values. The
endpoints of a resolved edge are also `ResourceHandle` values. The resolved
envelope's `kind`, not the handle class, identifies whether the resource is a
node or an edge.

`GraphHandle` is not the generic resource name because it would be ambiguous
with a handle to the CaseGraph as a whole.

### Separate dispatch from visitation

A dispatcher owns traversal order, cycle handling, resource resolution, and
release. A visitor owns task-specific selection and early termination.

The dispatcher notifies the visitor when it enters and leaves a node, property,
or edge. An enter result may allow traversal of selected properties, selected
edges, both, or neither. A leave result may continue or terminate the entire
traversal.

The dispatcher resolves a resource handle before delivering that resource to
the visitor. After the matching leave notification completes, the dispatcher
calls `release()` unless a concrete traversal contract establishes a shorter
lifetime. A visitor must not depend on a resolved object remaining resident
after leave.

Different dispatchers may implement different orders, such as depth-first,
breadth-first, or a bounded path traversal, without changing visitor behavior.
The first implementation needs only the traversal required by its first
OpenSpec capability.

### Keep traversal read-only

The traversal API does not mutate graph resources or owned files. Skills and
role agents receive graph resources and owned-artifact handles through this
API; they do not receive arbitrary CaseHome paths or directory-scanning access.
Internet access, when a run explicitly permits it, is separate from graph
access.

Initially, graph mutations cross the CaseGraph CLI boundary. Commands accept
strict inputs and emit JSON Lines results suitable for programmatic use. A
mutation command validates its complete intended change before committing any
part of it.

## Non-Decisions

This ADR does not define:

- exact TypeScript interfaces
- a general graph query language
- a shortest-path command
- every dispatcher implementation
- concurrent traversal
- a resource cache
- mutation through the traversal API
- MCP integration
- arbitrary filesystem capabilities for skills

MCP remains deferred until a concrete problem requires it.

## Consequences

Skills can perform light, bounded graph work through one reference type. The
dispatcher centralizes YAML resolution and memory release, while visitors stay
focused on the legal or drafting question.

Mutations remain auditable CLI operations rather than side effects hidden in a
visitor. Future programmatic mutation APIs require their own explicit decision
and OpenSpec contract.
