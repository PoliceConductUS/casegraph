# ADR 0014: Filing Packets And Docket Reconciliation

## Status

Accepted.

## Context

A court filing is often more than one document. A packet may contain a motion
or complaint, an appendix required by local rule, exhibits, a proposed order,
and other attachments. An amended complaint may itself be the principal
document of one filing or an exhibit to a motion seeking leave.

After filing, the court's docket exposes an entry with a main file and zero or
more attachments. CaseGraph must reconcile those downloaded files with the
authored document resources without duplicating each file as a second
`DocketDocument` node or turning packet membership into graph edges.

## Decision

### Reach packets and docket entries through typed properties

The Case resource references its filing packets and docket through typed
properties:

```yaml
apiVersion: casegraph.policeconduct.org/v1alpha1
kind: Case
metadata:
  uid: 01KCASE
spec:
  filing_packets:
    - 01KPACKET
  docket: 01KDOCKET
```

The Docket resource similarly stores its ordered docket-entry references:

```yaml
apiVersion: casegraph.policeconduct.org/v1alpha1
kind: Docket
metadata:
  uid: 01KDOCKET
spec:
  entries:
    - 01KENTRY
```

Neither relationship is a legal-effect edge.

### Represent a filing packet as an ordered aggregate

A `FilingPacket` resource stores an ordered `documents` property. Each item
references a `Document` resource and states that document's role in the packet.

```yaml
apiVersion: casegraph.policeconduct.org/v1alpha1
kind: FilingPacket
metadata:
  uid: 01KPACKET
spec:
  documents:
    - document: 01KMOTION
      role: main
    - document: 01KAPPENDIX
      role: appendix
    - document: 01KCOMPLAINT
      role: exhibit
      label: A
    - document: 01KORDER
      role: proposed-order
```

Exactly one packet item has the `main` role. Roles describe packet function,
not document kind. A complaint therefore remains a `Document` when its packet
role is `exhibit`.

Packet membership is a typed property. It is not an edge.

### Represent the docket as entries with owned files

A `Docket` resource stores an ordered property of `DocketEntry` references. A
`DocketEntry` represents one official docket event and owns the files downloaded
for that entry.

```yaml
apiVersion: casegraph.policeconduct.org/v1alpha1
kind: DocketEntry
metadata:
  uid: 01KENTRY
spec:
  entry_number: 30
  filed_at: "2026-08-22T14:31:00Z"
  documents:
    - file: files/main.pdf
      document: 01KMOTION
    - file: files/attachment-1.pdf
      document: 01KCOMPLAINT
    - file: files/attachment-2.pdf
```

`filed_at` belongs to the docket entry because the entry is the filing event.
Its main file and attachments share that event time. A document filed later is
represented by another docket entry. The time CaseGraph downloaded or observed
a file is provenance, not the legal filing time.

The optional `document` property is the complete reconciliation state. When it
is present, the downloaded file refers to that existing `Document` resource.
When it is absent, the file is unresolved. CaseGraph does not add
`match_status`, matching-method, or confidence fields to restate the presence
or absence of the reference.

An authored file intended for filing embeds its document resource ID when the
file format supports durable metadata. Docket import may use that ID to resolve
the optional `document` property. If the court strips the metadata or the
identity cannot otherwise be established, the reference remains absent until
the user resolves it on the docket-update branch.

The downloaded file remains owned by the `DocketEntry`; CaseGraph does not
create a parallel `DocketDocument` node merely because the court returned a
file.

When a `Filed` edge connects the docket entry to a filing packet, every
`document` reference recorded for that entry must identify a document that is
listed in that packet. An unresolved downloaded file has no `document`
reference.

### Record the legal filing relationship as one edge

Once CaseGraph establishes that a docket entry represents the filing of a
packet, it creates one `Filed` edge:

```yaml
apiVersion: casegraph.policeconduct.org/v1alpha1
kind: Filed
metadata:
  uid: 01KFILED
spec:
  from: 01KPACKET
  to: 01KENTRY
```

The edge does not duplicate `filed_at`; the `DocketEntry` owns that official
property. The packet-to-entry relationship is legally significant, while the
packet's document membership and the entry's file reconciliation remain typed
properties under ADR 0013.

### Reconcile through a Git transaction

Docket import and reconciliation run on a branch and worktree under ADR 0011.
The operation creates or updates the docket entry, stores downloaded files,
adds document references it can establish, and creates the `Filed` edge only
when the packet relationship is established. Unresolved references remain
visible for user correction before the branch is accepted.

## Non-Decisions

This ADR does not define:

- a closed list of filing-packet roles
- court-specific packet requirements
- the embedded-metadata format for PDF, DOCX, or Markdown
- automatic identity-reconciliation algorithms
- how a user resolves an unmatched docket file
- docket-entry amendment or correction semantics
- electronic-filing submission
- branch names or commit trailers

Those behaviors require concrete OpenSpec changes.

## Consequences

One authored document resource remains the identity used before and after
filing. Filing packets can represent motions with proposed amended complaints,
appendices, and other attachments without type-specific packet fields.

The graph records only one legally significant filing edge. Ordinary packet
and docket structure remains compact, ordered, and directly inspectable as
typed properties.
