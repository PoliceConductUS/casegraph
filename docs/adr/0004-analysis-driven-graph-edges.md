# ADR 0004: Legal-Effect Graph Edges

## Status

Superseded by ADR 0013.

## Context

CaseGraph is an investigation-first case-analysis tool. Its graph must support
legal reasoning, document review, and drafting without mirroring every
relationship found in source data or the filesystem.

Most relationships describe a node rather than perform legal work. An incident
may contain ordered events. An event may identify participants, timestamps,
actions, statements, and source locations. A document may identify citations,
quoted text, authors, and the package where it is stored. Those relationships
are useful for description, navigation, filtering, provenance, and audit, but
they are not graph edges merely because one value refers to another thing.

The legally useful graph is the set of connections that explain how evidence,
facts, claims, law, decisions, and legal tests operate on one another. Those
connections should eventually make it possible to trace material statements in
a document back through the graph, visualize the reasoning, find statements
that lack support or conflict with reviewed graph state, and identify the facts,
authority, or reasoning connections needed to cure a gap.

CaseGraph does not yet need a complete node schema, edge schema, relation
taxonomy, or document-traceability implementation. Those details should be
defined only when a concrete case problem requires them.

## Decision

### Store ordinary relationships as typed properties

CaseGraph will store relationships as node properties by default. A property
may contain scalar values, structured objects, references to other nodes, or
references to specific properties on other nodes.

Typed properties include ordinary containment, ownership, chronology, source
location, package membership, citations, quotations, authorship, participation,
provenance, and investigation-workflow references. These references may be
indexed, traversed, filtered, or displayed without becoming graph edges.

CaseGraph will not infer parent/child ownership from a property reference. A
property such as `incident.events` may record an ordered list of event
references without making the events children of the incident in the legal
reasoning graph.

Node properties will be added only when a concrete case problem requires the
property. This ADR does not define speculative properties for future node
kinds.

### Reserve edges for legal effects

An explicit graph edge must express a legal effect. The admission test is:

> Because this edge exists, a lawyer, court, or factfinder may or may not do
> what?

An answer may include inferring or disputing a fact, satisfying or negating an
element, defeating a defense, applying or distinguishing authority, precluding
an issue, challenging credibility, attributing liability, surviving a
procedural test, excluding evidence, or obtaining a remedy.

If the answer is only to locate a file, navigate a package, record containment,
identify a citation mention, preserve provenance, or describe when something
happened, the relationship is a typed property rather than an edge.

Legal effects may eventually include evidentiary, doctrinal, procedural,
causal, or remedial effects. These labels describe useful areas of legal
reasoning; this ADR does not establish a closed taxonomy or require an edge
classification field.

Illustrative legal-effect connections include:

```text
evidence segment -- corroborates --> factual proposition
factual proposition -- satisfies --> claim element
factual proposition -- negates --> defense basis
authority proposition -- supplies governing rule for --> legal issue
decision -- potentially precludes relitigation of --> issue
policy or custom -- causally connects --> constitutional deprivation
```

The relationship word alone does not determine whether a connection is an
edge. For example, a document's citation to an authority is a typed property. A
pinpoint-supported authority proposition that supplies a governing rule for a
case issue may justify a legal-effect edge.

### Apply general edge rules without defining a premature schema

Every legal-effect edge must eventually:

- identify the things it connects
- state a legally operative relationship
- have a consistent, meaningful direction for that relationship
- be traceable to the evidence, authority, decision, or analysis supporting it
- make uncertainty, dispute, and review state visible when the concrete use
  requires them
- contain enough information to audit the legal conclusion it permits or
  restricts

The exact fields, endpoint kinds, direction, prerequisites, procedural context,
status values, and validation rules will be defined with the first concrete
case workflow that needs each edge kind.

A legal proposition should have its own identity when it needs to be reused,
reviewed, cited, limited, or connected elsewhere. Edges should reference that
proposition rather than duplicate authoritative proposition text across edge
records. The proposition-node schema remains deferred until a concrete problem
requires it.

### Use edges to support document traceability

The intended direction is that every material factual or legal statement in a
document can be traced to the relevant graph material. That trace should make
it possible to:

- visualize the reasoning supporting the document
- identify statements with no supporting path
- identify conclusory statements whose path skips required reasoning
- identify statements contradicted by or inconsistent with reviewed graph
  state
- identify the missing facts, authority, decisions, tests, or connections
  needed to complete the path

This direction does not yet decide how documents are divided into traceable
units, how links are stored, how completeness is measured, or how findings are
presented.

## Non-Decisions

This ADR does not define:

- a complete node schema
- a complete edge schema
- a closed legal-effect taxonomy
- the properties required by future node kinds
- all claim, issue, element, defense, rule, fact, decision, or authority node
  kinds
- exact edge direction for relations not yet required by case work
- procedural-context, prerequisite, dispute, confidence, admissibility, or use
  permission fields
- document segmentation or document-to-graph link storage
- automated truth determination
- a generic graph query language
- a database schema
- graph mutation commands
- package layout or logical reference syntax

Those decisions should be made only when a concrete case workflow exposes the
problem they must solve.

## Consequences

CaseGraph will distinguish the legal reasoning graph from descriptive,
navigational, provenance, and filesystem relationships.

Typed properties can still support discovery and traversal without making the
legal-effect graph noisy.

Edges will be fewer and legally operative. A future edge kind must be justified
by the legal work it performs, not merely by the existence of a relationship.

The design provides direction for future case-driven development while leaving
schemas and implementation choices open until evidence from actual case work
requires them.
