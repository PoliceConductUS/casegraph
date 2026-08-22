# ADR 0008: Artifact Sidecars And Progressive Indexing

## Status

Accepted.

ADR 0009 resolves the previously open initial API-version and strict-envelope
decisions for CaseGraph resources.

## Context

Case material often arrives as existing folders containing PDFs, Markdown,
spreadsheets, recordings, transcripts, policies, filings, and other files.
CaseGraph needs to inventory and progressively understand that material without
moving the original files, placing all generated information in one type-based
folder tree, or treating initial machine observations as verified legal facts.

Some information is intrinsic to a file and reusable across cases. Examples
include its content hash, retrieval provenance, extracted text, page map,
objective structure, and stable fragment locations. Other information exists
only in a particular case, such as why a passage matters to a claim, whether an
authority supplies fair warning for one defendant's conduct, and which filing
used that analysis.

CaseGraph also needs deterministic artifact contracts exposed through the
capability-scoped read API and persisted through the JSONL mutation CLI. Skills
do not receive raw storage paths or patch sidecar YAML. The user's intake
projects use versioned,
Kubernetes-style envelopes, shared readers and writers, and kind-specific Zod
validation for this purpose.

## Decision

### Use CaseGraph sidecars

An indexed file may have a CaseGraph-owned YAML sidecar using the exact naming
convention:

```text
<complete-file-name>.casegraph.yaml
```

Examples:

```text
ruling.pdf
ruling.pdf.casegraph.yaml
ruling.md
ruling.md.casegraph.yaml
```

The `.casegraph.yaml` suffix makes ownership and serialization explicit and
allows deterministic sidecar discovery without confusing the sidecar with an
unrelated YAML file.

Directory presence alone does not make a sidecar authoritative. The containing
package's entry point and contract govern authoritative membership and managed
writes.

### Use versioned, kind-specific envelopes

Each sidecar uses a Kubernetes-style envelope with:

```yaml
apiVersion: <versioned CaseGraph API>
kind: <artifact kind>
metadata: {}
spec: {}
```

Original source artifacts and derived artifacts have distinct kinds and
distinct `spec` schemas. CaseGraph uses shared readers and writers that select
a strict Zod schema by `apiVersion` and `kind`.

The exact initial kind names remain implementation-time decisions. ADR 0009
defines the initial API-version string. New kinds should be added only when
their specifications genuinely differ rather than using one loose artifact
schema.

### Preserve source and derivation provenance

A source-artifact sidecar records at least:

- the source file path
- the source file SHA-256
- available retrieval provenance, such as PACER or CourtListener

A derived-artifact sidecar records at least:

- the derived file path
- the derived file SHA-256
- each source-artifact reference used to produce it
- the expected SHA-256 for each source
- available generator identity, version, and generation time

For example, `ruling.md.casegraph.yaml` identifies `ruling.pdf` and the exact PDF
SHA-256 from which the Markdown was extracted. A later hash mismatch means the
derived artifact may be stale. CaseGraph must not silently claim that the old
derivation describes changed source content.

Full extracted text belongs in a separate derived file such as `ruling.md`, not
inside the sidecar YAML.

Provenance and derivation are typed properties rather than legal-effect graph
edges under ADR 0004.

### Support progressive indexing

A future indexing capability may recursively inventory an explicitly selected
folder or resolved package. It may record file metadata and SHA-256 values and
create supported sidecars and case-independent derived artifacts when the
target package has opted into CaseGraph-managed writes under ADR 0007.

Initial extraction may identify candidate citations, people, dates, docket
numbers, transcript locations, or other observations. Those observations
remain machine-generated and unverified until a later workflow reviews or
promotes them. Indexing does not itself establish a fact, legal proposition,
claim relationship, or legal-effect edge.

Unsupported files and extraction failures remain visible in the inventory
rather than disappearing.

### Keep reusable artifacts separate from case applications

Case-independent file metadata, extraction artifacts, stable source fragments,
and reusable authority propositions may live in an authorized shared package.

Case-specific connections live in the workspace-home package. Those include:

- factual assertions made in the case
- relationships to case events, parties, defendants, claims, and elements
- material similarities and differences between this case and an authority
- qualified-immunity and fair-warning applications
- legal-effect edges
- filing-version uses and strategy decisions

This separation allows multiple cases to reuse one source or authority package
without mixing their legal applications.

### Allow authored-document traceability

Authored Markdown may eventually associate visible text with a stable,
non-visible CaseGraph reference. The reference should resolve to a case-specific
record that can identify the source artifact, exact fragment, fact or authority
proposition, legal-effect connection, and filing snapshot supporting the span.

The source document remains readable without displaying the CaseGraph metadata.
One reusable proposition or source fragment may support multiple document spans
without duplicating its analysis.

## Non-Decisions

This ADR does not define:

- exact source-artifact or derived-artifact kind names
- complete artifact schemas
- the recursive indexing command name or syntax
- supported extraction formats and tools
- automatic re-extraction after a source changes
- immutable source-version or artifact-version policy
- automatic reevaluation of downstream references
- exact fragment-anchor schemas
- exact non-visible Markdown, DOCX, or PDF markup
- search-index implementation or storage

Those behaviors require concrete OpenSpec changes before implementation.

## Consequences

CaseGraph can incrementally understand existing folders while preserving the
original material and distinguishing extraction from reviewed legal analysis.

Sidecars provide a deterministic provenance and validation boundary. Source
hashes preserve the ability to detect stale derivations and add versioning or
dependency-triggered review later without requiring those systems now.

Reusable source knowledge may be shared across cases, while case-specific legal
connections remain owned by the applicable workspace home.
