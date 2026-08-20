# CaseGraph Graph Model

## Purpose

This document explains the current graph model for CaseGraph.

It is a design document, not a final schema. It records what is currently known and how to think about the graph so implementation can stay small, consistent, and auditable.

## Core Idea

CaseGraph is a graph of case knowledge.

The durable graph records for a case are the **main case graph**. The main case
graph lives under `workspace/<case-id>/` outside analysis working directories.
Temporary analysis files live in **analysis worktrees** under
`workspace/<case-id>/analysis/`. Analysis worktrees can prepare, export, import,
and review proposed analysis, but they are not the main case graph until a later
command explicitly applies reviewed material.

The graph is made of:

- **nodes**: things that exist or need to be tracked
- **edges**: relationships between things
- **provenance**: how the node or edge became part of the graph
- **status**: whether the node or edge is verified, proposed, unknown, disputed, incomplete, or not usable

The graph should make case reasoning inspectable. A user should be able to ask:

- What do we know?
- How do we know it?
- Who introduced it?
- What does it support?
- What weakens it?
- What is missing?
- What is not safe to use yet?

## Nodes

A node is a thing that may matter to the case.

Nodes should be small enough to connect precisely, but not so small that the graph becomes unusable. The right size depends on the work. For example, one PDF is a source node. A single important assertion extracted from that PDF may be a fact node. A legal rule from one page of an opinion may be a proposition node.

The node categories below provide decision guidance, not complete schemas. A
node kind should gain a property only when a concrete case problem requires the
property. CaseGraph should not define fields merely because they may be useful
later.

Known node categories include:

### Case

The case or matter being investigated.

Example:

```text
case: example-v-example-city
```

### Source

Any factual or procedural material.

Examples:

- complaint
- motion
- response
- reply
- exhibit
- transcript
- bodycam video
- docket entry
- order
- public-records production
- agency letter
- AG ruling letter
- email
- spreadsheet

### Filing

A source filed in court. A filing can be a specialized source node.

Examples:

- motion to dismiss
- response
- reply
- order
- notice
- appendix

### Fact

A source-supported factual assertion.

A fact should have a source citation or a clear gap explaining why the citation is missing.

### Possible Fact

An assertion that might become a fact but has not yet been evaluated or supported.

Possible facts are useful because they prevent unreviewed leads from disappearing.

### Inference

A conclusion drawn from facts.

An inference is not itself a source fact. It should connect back to the facts it depends on.

### Hypothesis

A theory or idea under investigation.

A hypothesis may have no supporting facts yet. It should record what data would support it and what data would weaken or falsify it.

### Gap

Missing information or missing analysis.

Examples:

- missing source
- missing pinpoint
- missing criminal disposition
- missing authority
- missing review of adverse authority
- missing public-records response
- missing comparison case
- missing person research
- missing jurisdiction analysis

### Public-Records Request

A TPIA, FOIA, or other records request.

Requests should connect to the gaps they are meant to close.

### Public-Records Response

An agency response, production, denial, clarification, cost estimate, AG letter, ruling, or appeal connected to a request.

### Authority

A graph-backed legal source, not just a citation record.

Examples:

- constitution
- statute
- ordinance
- rule
- regulation
- policy with legal effect
- judicial decision
- local rule

Authorities exist independently of any one case. Authority records are expected
to become a top-level collection:

```text
authorities/
  <authority-id>/
    root.yaml
```

### Authority Graph

The reusable graph extracted from the authority itself.

An authority graph can contain the authority source, rules, holdings,
limitations, quotes, and other internal authority structure that can be reused
across cases.

### Case Graph

The graph for one case.

The case graph records case-specific facts, incidents, filings, claims,
hypotheses, gaps, and proposed or applied analysis for that case.

### Authority Edge

A case-specific legal-significance connection from the case graph to authority
graph nodes.

Authority relevance is represented by authority edges, not by treating an
authority as globally helpful or relevant. Each authority edge must explain the
legal significance of the connection for this case and include pinpoint citation
support. Citations should be pinpoint citations unless the citation only
identifies that a source exists.

### Legal Proposition

A specific rule, holding, limitation, quote, or principle extracted from an authority.

The proposition should be narrower than the authority. One case may contain many propositions.

### Case-Specific Authority Posture

How a legal proposition may be used in this case.

This is case-specific and may vary by claim, hypothesis, fact pattern, procedural posture, jurisdiction, opponent argument, or draft section.

### Law

A law implicated by the case.

Examples:

- U.S. Constitution
- Texas Constitution
- 42 U.S.C. § 1983
- Texas Penal Code provision
- municipal ordinance
- public-information law
- local court rule

A law node may connect to authorities interpreting it, hypotheses involving it, gaps about its validity, and jurisdictions where it applies.

### Jurisdiction

A legal or governmental scope that affects authority, procedure, or records access.

Examples:

- United States
- Fifth Circuit
- Northern District of Texas
- Texas
- Dallas County
- Example City
- Example Municipal Court
- Texas Attorney General public-information process

Jurisdiction nodes matter because authority posture depends on where the case is pending and what law governs the issue.

### Person

A person involved in the case or investigation.

Examples:

- plaintiff
- officer
- prosecutor
- judge
- magistrate judge
- clerk
- agency records officer
- witness
- expert
- lawyer

### Organization

An entity involved in the case or investigation.

Examples:

- city
- police department
- court
- prosecutor's office
- agency
- vendor

### Position

A legal, factual, or strategic position taken by a party.

Examples:

- defense theory
- plaintiff response position
- agency public-records position
- court ruling rationale

### Draft Section

A section of a draft brief, letter, request, or report.

Draft sections can connect to facts, authorities, hypotheses, gaps, and opponent positions.

### Report

A generated view of the graph.

Examples:

- current case state
- gap report
- authority posture report
- drafting packet
- public-records request status report

### Unknown Or Missing Information

Unknowns should exist in the graph when they affect analysis.

Examples:

- unknown criminal disposition
- unknown officer identity
- unknown policy source
- unknown legal basis for agency denial
- unknown whether a case was appealed
- unknown whether a statute has been challenged

Unknown nodes should not be treated as facts. They exist to keep investigation needs visible.

## Properties And Typed References

Properties describe a node, record ordinary structure, and connect supporting
information that does not itself perform legal work. Properties may contain
typed references to other nodes, properties, packages, files, sources,
citations, or provenance records.

Containment, ownership, chronology, citation mentions, quotations, authorship,
participation, source location, package membership, and investigation workflow
connections are properties by default. They may remain traversable and
indexable without appearing as legal-effect edges.

Whether a relationship is an edge depends on its legal operation, not its verb.
A document citing an authority is an ordinary reference. An authority
proposition limiting a rule applied to a claim may carry a legal effect.

## Legal-Effect Edges

An edge records a relationship that performs legal work. It should answer:

> Because this edge exists, what may or may not be inferred, proved, defeated,
> applied, distinguished, precluded, excluded, attributed, or remedied?

Illustrative legal effects include:

- evidence corroborates or contradicts a factual proposition
- a factual proposition satisfies or negates a claim element or defense basis
- an authority proposition supplies, limits, or distinguishes a governing rule
- a decision precludes or otherwise changes how an issue may be litigated
- a policy or custom supplies a required causal connection
- a legal rule authorizes, prohibits, imposes a duty, grants a right, or creates
  a remedy

These examples are decision guidance, not a closed taxonomy. A relation name,
endpoint contract, direction, and required edge properties should be defined
only when a concrete case workflow needs that edge.

Every legal-effect edge should eventually identify what it connects, state the
legal operation, preserve an auditable basis, use a consistent direction, and
make material uncertainty visible. Exact fields remain deferred until a real
edge problem determines what information is necessary.

A reusable legal proposition should have its own identity. Edges should refer
to the proposition instead of duplicating authoritative proposition text.

The intended document-traceability direction is that every material factual or
legal statement can be traced through the graph. That trace should support graph
visualization, reveal unsupported or conclusory statements, reveal statements
that conflict with reviewed graph state, and identify missing facts, authority,
decisions, tests, or reasoning connections. Document segmentation, link storage,
and completeness rules remain undefined until a concrete document workflow
requires them.

## Laws And Jurisdictions

Laws and jurisdictions belong in the graph because legal meaning depends on them.

For example:

```text
42 U.S.C. § 1983 -> creates remedy -> constitutional violation
Fifth Circuit -> controls -> Northern District of Texas on federal law
Texas Public Information Act -> governs -> TPIA request
Example City ordinance -> applies in -> Example City
Heck v. Humphrey -> interprets -> Section 1983 damages claims
```

Jurisdiction also affects authority posture.

For a federal civil-rights case in the Northern District of Texas:

- U.S. Supreme Court decisions may control federal law.
- Fifth Circuit published decisions may control federal law.
- Northern District decisions may be persuasive but not binding in the same way.
- Texas Supreme Court decisions may control Texas-law issues.
- Texas intermediate appellate decisions may be persuasive or controlling only under specific Erie analysis.
- Municipal ordinances may matter as local law but require their own source and validity analysis.

The graph should not hide these distinctions.

## Provenance

Every important node and edge should be traceable.

The graph should record how the item entered the case:

- created by user
- extracted from source
- introduced by opponent
- created by court ruling
- produced by agency
- generated by report
- imported from research
- inferred by analysis

Provenance matters because two identical-looking statements may have different legal significance depending on who said them and where.

Example:

```text
"Plaintiff was convicted" as a defense assertion is not the same thing as a verified criminal disposition.
```

## Status

Nodes and edges should have statuses that prevent unsafe use.

Known status concepts include:

- unreviewed
- partially reviewed
- reviewed
- proposed
- verified
- candidate
- disputed
- contradicted
- unsupported
- needs source
- needs pinpoint
- needs legal review
- needs jurisdiction review
- strategy-only
- investigation-only
- draft-ready
- do not use
- abandoned

Exact status fields may vary by node type. The principle is that uncertainty must be visible.

These are illustrative status concepts, not a required property set. A concrete
workflow should define only the status fields and values needed to solve its
current problem.

## Missing And Unknown Information

Missing or unknown information should be represented directly when it affects the work.

This can be done with a gap node, an unknown node, or both.

Use a **gap** when the issue is an action item:

```text
Need municipal-court disposition for Class C charge.
```

Use an **unknown node** when the unknown thing itself must connect to other graph items:

```text
Unknown criminal disposition -> affects -> Heck defense position
Unknown officer identity -> blocks -> officer conduct research
```

Unknown nodes must not be cited as facts. They are placeholders for investigation and audit.

## When The Graph Is Broken

The graph is broken or incomplete when it hides uncertainty or allows unsupported use.

Known break conditions include:

- a factual assertion has no source or gap
- a source has no review status
- a possible fact has not been accepted, rejected, or deferred
- a hypothesis has no support/falsification criteria
- a public-records request is not tied to a gap
- a records response is not tied to the request it answers
- produced data is not tied back to extracted facts or gaps
- an authority is cited without verification
- a legal proposition has no pinpoint
- a case-specific authority posture lacks an approved use
- an authority is used for a proposition not approved in the graph
- an edge has no relationship type
- an edge has no provenance
- an opponent position has not been accepted, rebutted, deferred, or marked as requiring response
- a jurisdiction-sensitive issue has no jurisdiction node or jurisdiction review
- a draft section relies on strategy-only material
- a node is isolated without explanation
- a gap has no status

Some broken states are filing-blocking. Others are investigation warnings. The graph should eventually distinguish those.

## When The Graph Is Complete Enough

The graph is never complete in an absolute sense.

It is complete enough for a task when:

- every relevant source has a review status
- every factual assertion needed for that task has a source or gap
- every legal proposition needed for that task has an authority posture
- every missing item is represented as a gap
- every gap is either resolved, deferred, or accepted as non-blocking for that task
- every opponent position relevant to that task has been considered
- every jurisdiction-sensitive issue has been identified
- every draft-ready item is separated from strategy-only or investigation-only material

## Extensibility

The graph should be extensible by adding node types, edge types, reports, and audits when real case work requires them.

Extensibility does not mean adding speculative commands or tables early.

Current extension rule:

> Add the smallest new graph concept that accurately represents a real case need that cannot be represented by existing concepts.

Before adding a new node type, ask:

- Is this a real thing that needs its own identity?
- Will other things connect to it?
- Does it need its own status or provenance?
- Would making it a note hide something important?

Before adding a new edge type, ask:

- What legal work does the relationship perform?
- What may a lawyer, court, or factfinder infer, prove, defeat, apply,
  distinguish, preclude, exclude, attribute, or remedy because it exists?
- Can the connection remain a typed property without losing necessary legal
  reasoning?
- What information did the concrete case problem prove must be recorded on the
  edge?

Before adding a new report, ask:

- What decision will this report support?
- What graph data does it rely on?
- What broken or incomplete state should it reveal?

## Current Non-Decisions

This document does not decide:

- final file format
- database schema
- Supabase usage
- full CLI command tree
- UI design
- AI model integration
- import pipeline
- citation parser
- records-request automation

Those should be decided only when a concrete workflow requires them.
