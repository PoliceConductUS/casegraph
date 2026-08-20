# Source Discovery

## Purpose

This document explains how CaseGraph should think about places to look for case nodes.

Sources like CourtListener, PACER, local courts, municipal courts, public-records portals, agency websites, and attorney-general letter databases are not facts by themselves. They are discovery locations. They help identify documents, authorities, people, organizations, laws, gaps, and relationships that may need to enter the graph.

## Core Idea

CaseGraph should distinguish three things:

1. **Source system**
   A place where information may be found.

2. **Case-enabled source system**
   A source system selected for use in a specific case.

3. **Retrieved source**
   A specific document, record, docket entry, production, opinion, or file obtained from that system.

Example:

```text
CourtListener
  global source system

CourtListener enabled for example-v-example-city
  case-specific search source

Heck v. Humphrey opinion from CourtListener
  retrieved source / authority artifact
```

## Global Source Systems

Global source systems are reusable reference nodes. They describe places where CaseGraph may look.

Examples:

- CourtListener
- RECAP
- PACER
- federal district court dockets
- federal appellate dockets
- state appellate court portals
- state trial court portals
- municipal court portals
- county court portals
- city public-records portals
- police department websites
- city council agenda/minutes systems
- state attorney-general public-information letter databases
- agency open-data portals
- secretary-of-state business records
- licensing or discipline databases
- judicial publications pages
- law-review repositories
- local rule repositories
- ordinance/code publishers
- archived web pages
- email productions
- physical records received by mail

Global availability does not mean every case should use every source system.

## Case-Enabled Source Systems

A case should explicitly enable the source systems that matter to that case.

This avoids two problems:

- pretending the graph searched everywhere
- burying the user under irrelevant source systems

Example:

```yaml
case: example-v-example-city
enabledSourceSystems:
  - courtlistener
  - recap
  - pacer-northern-district-texas
  - example-municipal-court
  - example-city-tpia
  - texas-attorney-general-open-records-letters
```

The case-specific source setting should eventually record:

- why the source system is relevant
- what questions it may answer
- what jurisdictions it covers
- what access is required
- what has been searched
- what has not been searched
- what search terms or filters were used
- what records were found
- what records were not found
- what gaps remain

## Retrieved Sources

A retrieved source is a concrete item.

Examples:

- complaint PDF
- motion to dismiss PDF
- docket entry
- court order
- opinion
- municipal court disposition
- public-records response letter
- produced spreadsheet
- bodycam file
- training policy
- city ordinance
- AG ruling letter

Retrieved sources should become graph nodes only when they are actually found, received, or imported.

The graph should track:

- where it came from
- when it was retrieved
- how it can be retrieved again
- whether it has been reviewed
- whether facts or propositions were extracted from it
- whether it created, resolved, or changed any gaps

## Source Systems Are Not Authority

A source system is not itself legal authority.

For example:

- CourtListener is a place to find opinions.
- PACER is a place to find court filings.
- A city public-records portal is a place to request or receive records.

The authority or source is the actual retrieved item, not the system where it was found.

## Source Systems Are Not Complete By Default

CaseGraph should never imply that a source system was fully searched unless the graph records what was searched.

A source-system search should eventually be able to say:

```text
CourtListener searched for:
- "Example City" AND "Section 1983"
- "Example City police" AND "Heck"
- "Class C" AND "retaliation"

Search status:
- partial

Known limits:
- may miss sealed filings
- may miss cases without full-text indexed documents
- may miss municipal-court records
```

This is important because an empty search result is not the same thing as proof that nothing exists.

## Nodes Found Through Source Systems

Source systems may reveal candidate nodes, including:

- authorities
- legal propositions
- filings
- orders
- facts
- possible facts
- people
- organizations
- laws
- ordinances
- policies
- jurisdictions
- public-records gaps
- comparable cases
- opponent positions
- court reasoning
- citations to other sources

Candidate nodes should not become verified nodes merely because a source system found them.

They should carry an evaluation status.

## Search Results As Graph Items

Search results can matter even before they become sources.

For example:

```text
Search result:
N.D. Tex. case involving Example City and Section 1983.

Status:
candidate comparable case, not yet reviewed.
```

That can be represented as a possible source, candidate case, or gap-closing lead.

The graph should make clear that this is not yet reviewed or citeable.

## Gaps And Source Systems

Gaps should drive source-system selection.

Example:

```text
Gap:
Need to know whether the Class C charge resulted in conviction, dismissal, deferred disposition, or no prosecution.

Likely source systems:
- Example Municipal Court
- Dallas County records if applicable
- public-records request to Example City
- prosecutor records if available
```

This allows CaseGraph to answer:

- What gap are we trying to close?
- Where should we look?
- Have we looked there?
- What did we find?
- What remains unknown?

## Per-Case Source Configuration

The initial design should treat source systems as globally known but enabled per case.

That means:

- the tool may have a list of known source system definitions
- a case should record which ones are relevant
- a case should record source-system-specific searches and retrievals
- source systems not enabled for a case should not appear as searched or considered

This avoids creating a fake sense of completeness.

## When Source Discovery Is Broken

Source discovery is broken or incomplete when:

- a retrieved document has no source system or retrieval note
- a public-records gap has no likely source system
- a case-specific source system has no reason for being enabled
- a search result is treated as reviewed source material
- a source system is marked complete without search details
- a retrieved source is cited before review
- an empty search result is treated as proof of nonexistence
- a jurisdiction-sensitive source system is used without jurisdiction review

## Current Non-Decisions

This document does not decide:

- exact source-system schema
- whether source-system definitions are stored in YAML, JSON, or a database
- whether CaseGraph connects directly to CourtListener, PACER, or any public-records portal
- whether searches are manual, automated, or both
- how credentials are stored
- how source-system search results are imported

Those decisions should wait until a concrete source-discovery workflow requires them.
