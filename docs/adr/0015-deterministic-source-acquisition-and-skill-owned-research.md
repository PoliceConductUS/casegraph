# ADR 0015: Deterministic Source Acquisition And Skill-Owned Research

## Status

Accepted.

## Context

CaseGraph and the legal-skills workflows need public and case-provided sources
for several kinds of analysis. Examples include opinions, books, articles, and
speeches associated with a judge; filings and professional publications
associated with an attorney; statutes and rules; police-department policies;
and evidence of municipal or police-department organization and chain of
command.

Finding and using those materials involves different responsibilities:

1. deciding what research question to ask and where to look;
2. executing a search or retrieval against a source system;
3. preserving the request, response, retrieved artifact, and provenance;
4. deciding whether a candidate is relevant and what it means;
5. proposing authorship, attribution, policy, organizational, or legal records;
   and
6. validating, reviewing, versioning, and reusing those records.

CaseGraph already distinguishes source systems, case-enabled source systems,
search results, retrieved sources, and reviewed graph records. It also supports
explicit AI analysis workflows. The architectural question is therefore not
whether CaseGraph may ever use AI. It is whether source acquisition itself
should perform open-ended AI research or silently make semantic decisions.

Combining acquisition and interpretation would make searches difficult to
replay, blur the line between candidates and reviewed records, and allow a
connector to infer authorship, relevance, adoption, authority, or organizational
relationships that its source response does not establish.

## Decision

### Keep CaseGraph source acquisition deterministic

CaseGraph may provide connectors that execute explicit searches and retrievals
against configured source systems. A connector receives a bounded request from
an authorized caller. The request identifies the source system, query or source
identifier, filters, declared scope, and any required access or cost approval.

A connector may:

- execute the supplied request;
- preserve request parameters and checked dates;
- preserve the raw response or retrieved artifact;
- record source-system and retrieval provenance;
- calculate hashes and detect duplicates;
- register, reconcile, and refresh source artifacts;
- report partial, unavailable, rejected, or ambiguous results; and
- make the acquisition reproducible when the source system permits it.

Source acquisition does not generate its own research question, broaden its
scope, select a different source system, or use AI to interpret the results. A
connector result is a candidate or retrieved source, not a verified fact,
authorship conclusion, adopted policy, organizational relationship, legal
authority, or legal effect.

This boundary applies to CaseGraph source acquisition. It does not prohibit a
separately specified CaseGraph analysis workflow from using AI on an approved,
immutable input packet.

### Let skills own research intent and semantic interpretation

A domain skill decides what to investigate, why the source family matters, and
what evidence would answer the research question. Its research stage may
construct explicit requests to configured CaseGraph connectors from its
capability-scoped graph view and submit them through CaseGraph's public command
boundary.
The connector, not the skill, owns internet access. A skill receives no
arbitrary filesystem or network capability and may not bypass CaseGraph with
another research tool.

CaseGraph registers returned candidates and provenance only through the public
JSONL mutation boundary and the CaseHome Git transaction required by ADR 0011.
The skill may then review registered candidates and propose semantic records.
Those proposals preserve the exact source identity, source location, checked
date, producer and operation identity when applicable, interpretation limits,
and contrary or missing evidence. A proposal cannot mark itself reviewed or
verified.

Profile-specific research remains with the profile skill because the relevant
queries, attribution rules, and evidence boundaries depend on the profile:

- A Judicial Reasoning Profile skill researches opinions, orders, books,
  articles, and speeches while distinguishing reasoning authorship, stated
  philosophy, and self-presentation.
- A defense-counsel profile skill researches filings and professional materials
  while distinguishing signer, appearance counsel, oral advocate, named author,
  and merely listed counsel.
- A municipal profile skill researches charters, ordinances, delegations,
  policies, organizational materials, testimony, and other evidence needed to
  propose municipal structure and chain-of-command records.

CaseGraph stores the resulting source-backed records and their review state. It
does not decide their semantic meaning merely because it retrieved the source.

### Use independent collection skills for reusable source corpora

When source collection is useful outside one profile, collection should be an
independent skill rather than duplicated across profile skills.

Statutes, rules, and cases belong to an independent legal-authority research and
collection workflow. A later authority audit remains a separate, non-mutating
verification stage and does not become the collector it audits.

Police-department policy sources belong to an independent policy-source
collection workflow. Policy analysis consumes the resulting immutable source
manifest, and a case-specific policy-compliance assessment consumes a validated
policy catalog. Collection, analysis, and case assessment remain distinct.

CaseGraph does not need one generic AI skill that attempts to find every source
family. The different source families have materially different identity,
authorship, attribution, version, effective-date, and evidence requirements.

### Preserve explicit review and promotion

Search results, machine extractions, and skill-generated semantic records remain
candidate or proposed records until an explicit review or import action changes
their status. Deterministic schema validation proves only that a record satisfies
its data contract. It does not establish factual truth, legal authority,
authorship, policy adoption, final-policymaker status, relevance, or legal
effect.

An empty or incomplete search does not establish nonexistence. Every search
record preserves its actual query, filters, checked date, coverage limits, and
known missingness. Fee-incurring retrieval requires separate explicit
authorization.

### Keep artifacts in their authorized packages

When an approved source file already exists in a resolved package, CaseGraph
references that file and its hash instead of moving or copying it. Skills see
the source through stable graph handles and resolved content, not the physical
path. A connector writes a newly retrieved artifact only to an explicitly
authorized package that has opted into CaseGraph-managed writes.

Reusable, case-independent sources and derived artifacts may live in an
authorized shared package. Case-specific applications, profile versions,
assessment records, and legal-effect connections remain in the applicable case
workspace home. This follows ADR 0008's separation between reusable artifacts
and case-specific applications.

Authorship, appearance, organizational, policy, and provenance relationships
are typed properties unless a separately reviewed relationship performs the
legal work required for a legal-effect edge under ADR 0013.

## Responsibility Matrix

| Source family                                 | Research and interpretation owner                                       | CaseGraph responsibility                                                              |
| --------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Judge opinions, books, articles, and speeches | Judicial Reasoning Profile skill                                        | Execute bounded retrieval, preserve sources, and store reviewed authorship records    |
| Attorney filings, articles, and CLE materials | Defense-counsel profile skill                                           | Retrieve docket or public records and preserve attribution states                     |
| Statutes, rules, and cases                    | Independent legal-authority research skill                              | Preserve authority artifacts, effective dates, and provenance                         |
| Police-department policies                    | Independent policy-source collection skill, followed by policy analysis | Preserve policy versions, source metadata, and validated imported records             |
| City and police-department chain of command   | Municipal profile skill                                                 | Store sourced entities, roles, delegations, temporal relationships, and review status |

## Non-Decisions

This ADR does not define:

- exact connector commands, APIs, or schemas;
- which source systems receive connectors first;
- credential storage;
- automated browser behavior;
- paid-source integration;
- exact candidate, proposal, review, or verification status enums;
- exact artifact or sidecar kinds;
- a general workflow engine;
- a provider or model for semantic research;
- the schemas for judge, counsel, municipal, authority, policy, or compliance
  profiles; or
- whether a particular connector is implemented inside CaseGraph or invoked as
  an external deterministic command.

Skill-facing graph access, lazy resource resolution, traversal, and mutation
transport are governed separately by ADR 0012. CaseHome mutation history and
transaction isolation are governed by ADR 0011.

Those behaviors require concrete OpenSpec changes before implementation.

## Consequences

CaseGraph can provide reproducible source acquisition and durable provenance
without hiding open-ended model behavior inside connectors. Skills retain the
domain context needed to formulate searches and interpret sources, while their
outputs remain proposals until explicitly reviewed.

The separation adds an intentional handoff between acquisition, semantic
analysis, and promotion. That extra step makes source coverage, uncertainty,
authorship, policy adoption, and organizational attribution visible instead of
allowing one opaque operation to claim that it searched, understood, and
verified the source universe.

Profile skills may share deterministic connectors without duplicating retrieval
mechanics. Independent source-collection skills can build reusable authority and
policy corpora without coupling those corpora to one profile or case.
