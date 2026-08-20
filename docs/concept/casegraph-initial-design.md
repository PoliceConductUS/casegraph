# CaseGraph Initial Design

## Purpose

CaseGraph is a command-line tool for building an auditable investigation graph for a legal case.

The first user is a pro se litigant. The tool should not require legal training to start using it. Legal precision still matters internally, but the user-facing workflow should use plain language where possible.

The initial purpose is not to draft briefs. The initial purpose is to track what is known, what is unknown, what has been evaluated, what still needs data, and how facts, ideas, authorities, requests, filings, and people relate to each other.

## Current Known Need

The current known need is:

> Create a new case workspace that can later hold a traceable investigation graph.

At this point, no other command is known to be required.

The first CLI operation should therefore be:

```bash
casegraph cases new <case-id>
```

Example:

```bash
casegraph cases new example-v-example-city
```

The command should create a case workspace and explain what it created. It should not overwrite an existing case. It should provide useful help through:

```bash
casegraph --help
casegraph cases --help
casegraph cases new --help
```

No other commands should be added until a concrete workflow requires them.

## Design Principle

CaseGraph should start with the smallest useful behavior and grow only from real case work.

Do not add a command, database table, workflow, or abstraction because it seems likely to be useful later. Add it when the current case requires it.

## Core Model

The underlying model should be a case-knowledge graph:

- **Node**: a thing in the case.
- **Typed property**: descriptive, structural, navigational, source, package, or
  provenance information about a node, including references to other things.
- **Legal-effect edge**: a connection that explains what a lawyer, court, or
  factfinder may or may not infer, prove, defeat, apply, distinguish, preclude,
  exclude, attribute, or remedy.

The durable case record is the **main case graph**. Future analysis commands may
create short-lived **analysis worktrees** under `workspace/<case-id>/analysis/`
to stage proposed analysis before any reviewed material is applied to the main
case graph.

Examples of nodes may include:

- case
- source
- filing
- fact
- possible fact
- hypothesis
- gap
- public-records request
- public-records response
- authority
- legal proposition
- person
- organization
- opponent position
- plaintiff position
- draft section
- report

These node types are not a promised command surface. They are conceptual categories for graph data.

Examples of legal-effect edges may include:

- supports
- weakens
- contradicts
- rebuts
- distinguishes
- limits
- depends on
- satisfies
- attacks
- responds to
- authorizes
- prohibits
- imposes a duty
- grants a right
- creates a remedy

The relationship word alone does not make a connection an edge. Citations,
quotations, assertions, provenance, containment, gap/request workflow, and
package membership are typed properties unless the connection itself performs
legal work.

Edges are important because they record the case-specific legal effect. A fact
does not simply "belong to" a claim. A source-supported fact may support one
hypothesis, weaken another, contradict an opponent position, or satisfy an
element. A need for a public-records request is ordinary investigation workflow
information unless a concrete legal analysis gives that relationship a legal
effect.

## Hypotheses

Potential legal theories and investigation ideas should be represented as hypotheses.

A hypothesis is not a fact. It is controlled speculation that the graph can test.

Each hypothesis should eventually be able to record:

- what the hypothesis says
- why it matters
- what data is needed to test it
- what would support it
- what would weaken or falsify it
- what facts currently support it
- what facts currently weaken it
- what authorities may matter
- what gaps block further confidence
- whether it is strategy-only, investigation-ready, draft-ready, weakened, contradicted, or abandoned

Example:

```text
Hypothesis:
Example City uses Class C misdemeanor enforcement as retaliation or suppression, and then uses a recurring Section 1983 defense strategy, including Heck arguments, to block civil-rights claims before merits discovery.
```

The first step for such a hypothesis may be that there is no supporting data yet. The graph should make that visible instead of treating the hypothesis as established.

## Data Gaps And Public-Records Requests

Gaps are first-class graph objects.

A gap may be:

- missing factual support
- missing pinpoint citation
- missing source document
- missing authority
- missing adverse-authority review
- missing criminal-disposition data
- missing policy, training, or internal-affairs data
- missing prior-case comparison
- missing person or agency research

Public-records requests, including TPIA and FOIA requests, should be tied to gaps.

The graph should eventually connect:

```text
gap -> request -> agency response -> ruling/AG letter -> produced data -> extracted facts -> hypothesis or issue
```

This matters because records requests are not side work. They are a method for closing investigation gaps.

## Authorities And Case-Specific Authority Posture

Authorities are graph-backed legal sources, not just citation records. Their
text, court, date, and general precedential status exist outside any one case.
Authorities are expected to become a top-level collection:

```text
authorities/
  <authority-id>/
    root.yaml
```

But the relationship between an authority and this case is case-specific.

The graph should separate:

1. **Authority**
   The graph-backed legal source.

2. **Authority graph**
   The reusable graph extracted from the authority itself.

3. **Legal proposition**
   A specific rule, holding, limitation, quote, or principle extracted from the authority.

4. **Authority edge**
   A case-specific legal-significance connection from the case graph to authority graph nodes.

5. **Case-specific authority posture**
   How that proposition may be used in this case, for a specific claim, hypothesis, motion, defense position, procedural posture, or draft section.

The authority edge must explain the legal significance of the connection and
include pinpoint citation support. Citations should be pinpoint citations unless
the citation only identifies that a source exists.

The case-specific posture may include:

- approved proposition text
- approved pinpoints
- whether the authority is binding, persuasive, adverse, limiting, distinguishable, or candidate-only for this use
- what the authority may be cited for
- what the authority may not be cited for
- whether it must be addressed
- whether a limiting explanation is required
- whether the use is draft-ready, research-only, or prohibited

This avoids treating a case as simply "helpful" or "bad." The same authority can help one proposition, hurt another, and be irrelevant to a third.

## Citation Auditing

Citation auditing should be driven by case-specific authority posture.

The audit question is not only:

> Does this citation exist?

The better question is:

> Does this authority, at this pinpoint, support this proposition, in this case, for this use?

Future citation audits should be able to flag:

- unverified authorities
- missing pinpoints
- citations used for unapproved propositions
- overstatements of holdings
- dicta treated as binding
- candidate authorities used in near-filed drafts
- adverse authorities cited without explanation
- authorities used as facts about this case
- defense-favorable readings that are broader than the actual holding

## Opponent Filings

Opponent filings are new source material and adversary intelligence.

When an opposing party files something, the graph should eventually extract and connect:

- new defense positions
- new factual assertions
- new characterizations
- new authorities
- new case-specific authority posture entries
- concessions
- omissions
- attacks on plaintiff facts
- attacks on plaintiff authorities
- new gaps
- new support or weakness for existing hypotheses

The filing itself is a source. Positions inside it may be graph nodes. Their
citations, quotations, assertions, and provenance are typed properties. A
connection from an opponent position to an authority, fact, or plaintiff
response becomes an edge only when it records a legal effect; otherwise it
remains an explicit typed property.

## Current-State Views

The graph should eventually generate current-state views for human review and AI drafting.

The current-state view should not be a brief. It should be an auditable snapshot of analysis.

It should eventually answer:

- what the case is about
- what sources exist
- what has been reviewed
- what has not been reviewed
- what facts are verified
- what possible facts need evaluation
- what hypotheses exist
- what would support or falsify each hypothesis
- what gaps remain
- what records requests are tied to which gaps
- what has been produced in response to requests
- what authorities are verified
- what case-specific authority uses are approved
- what defense positions are active
- what plaintiff positions answer them
- what material is citeable
- what material is strategy-only
- what should be investigated next

This view should be suitable input for a later AI drafting model because it controls what the model may rely on.

## Pro-Se-Friendly CLI Rule

The CLI should be discoverable.

At minimum:

- root help must explain what CaseGraph does
- command help must explain when to use the command
- help must include examples
- help must say what the command creates or changes
- help must avoid unexplained legal terms
- future commands should be added only when needed by the current case workflow

The first command is:

```bash
casegraph cases new <case-id>
```

No default case, status command, check command, source command, fact command, gap command, request command, or report command is part of the design yet. Those may be added later only when a concrete workflow requires them.

## Database

Supabase may become the system of record if local files become insufficient.

At this point, no database is required because the first known workflow is only creating a case workspace. Do not add Supabase schema, migrations, or client code until a concrete operation requires persistence beyond local files.

## Done For This Step

This step is done when the project has a clear initial design that:

- defines CaseGraph's purpose
- commits to an investigation-first graph
- treats hypotheses as first-class objects
- treats gaps and public-records requests as connected graph objects
- separates authorities from case-specific authority posture
- makes citation auditing posture-driven
- treats opponent filings as adversary intelligence
- limits the first CLI operation to `casegraph cases new <case-id>`
- avoids speculative commands and infrastructure
