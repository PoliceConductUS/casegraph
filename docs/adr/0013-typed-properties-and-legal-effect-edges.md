# ADR 0013: Typed Properties And Legal-Effect Edges

## Status

Accepted.

Supersedes ADR 0004.

## Context

CaseGraph contains many references that are useful for storage, navigation,
provenance, and presentation. Treating each reference as an edge would bury the
legally operative graph beneath containment and filesystem structure.

ADR 0004 established the correct legal-effect threshold. The global resource
identity and strict envelope decisions now require that threshold to be stated
without implying that nodes and edges live in different stores or use different
reference types.

## Decision

### Use typed properties for ordinary relationships

A reference is a typed property unless the relationship itself has legal
significance.

Typed properties include:

- containment and ordered membership
- package and filing-packet membership
- docket-entry membership
- artifact ownership and file locations
- chronology
- source and derivation provenance
- citations and quotations
- authorship and participation
- identity reconciliation between an imported file and a known document
- workflow and audit references

These properties may contain globally unique resource IDs. The traversal API
resolves those IDs as `ResourceHandle` values without promoting the references
to edges.

### Reserve edges for legally significant connections

An edge is admitted only when the relationship answers this question:

> Because this relationship exists, what may or may not a lawyer, court, or
> factfinder infer, establish, dispute, exclude, require, preclude, or obtain?

An edge may express an evidentiary, doctrinal, procedural, causal, liability,
or remedial effect. Merely locating a file, grouping documents, recording a
source, or matching two representations of one document does not satisfy the
test.

Every edge is itself a globally identified resource using the ADR 0009
envelope and ADR 0010 storage convention. Its endpoints are globally unique
resource IDs that resolve through the same `ResourceHandle` API used for node
references.

An edge records only the legally operative relationship and the information
required by that edge kind's schema. Descriptive facts about either endpoint
remain properties of the appropriate resources.

`Filed` is a legal-effect edge when it records that a filing packet became the
filing represented by a docket entry. Packet membership, docket containment,
and the match between a downloaded file and an authored document remain typed
properties.

## Non-Decisions

This ADR does not define:

- a closed edge-kind taxonomy
- the complete schema of any edge kind
- confidence, dispute, or review fields shared by all edges
- every permissible endpoint-kind pair
- a graph query language
- automated legal conclusions

Each new edge kind requires a concrete legal use and an OpenSpec contract.

## Consequences

The legal graph stays small enough to explain legal consequences. Ordinary
references remain traversable without being mislabeled as legal reasoning.

Storage and API code can treat every referenced object uniformly while the
validated resource kind preserves the substantive node-versus-edge
distinction.
