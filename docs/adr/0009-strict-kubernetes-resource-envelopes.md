# ADR 0009: Strict Kubernetes Resource Envelopes

## Status

Accepted.

## Context

CaseGraph persists graph resources, package entry points, and artifact sidecars
as YAML. Earlier decisions established `root.yaml` as the default package entry
point and Kubernetes-style envelopes for artifact sidecars, but older examples
also use unrelated top-level fields. Multiple envelope shapes would make
resource loading ambiguous and allow kind-specific data to bypass the schema
selected for that kind.

CaseGraph needs one strict envelope for every CaseGraph-owned YAML resource.
Repository configuration files that are not CaseGraph resources are outside
this decision.

## Decision

Every CaseGraph-owned YAML resource uses this envelope:

```yaml
apiVersion: casegraph.policeconduct.org/v1alpha1
kind: <registered resource kind>
metadata:
  uid: <globally unique resource ID>
spec: {}
```

The only permitted top-level fields are:

- `apiVersion`
- `kind`
- `metadata`
- `spec`
- `status`, when the selected resource schema explicitly defines it

`apiVersion` and `kind` select one strict resource schema. Resource-specific
data belongs under `spec`. Runtime or observed state belongs under `status`
only when that resource kind requires durable observed state.

The initial CaseGraph resource API version is
`casegraph.policeconduct.org/v1alpha1`.

`metadata.uid` is the resource's immutable, globally unique identifier. A
resource reference stores that identifier rather than a filesystem path.

The selected schema rejects unknown root fields, unknown metadata fields, and
unknown fields within `spec` and `status`. A field placed in the wrong envelope
section is invalid even if another resource kind uses a field with the same
name.

This envelope applies to `root.yaml` files and CaseGraph artifact sidecars.
ADR 0008 continues to govern sidecar naming and provenance. Older ADR examples
with fields such as `id`, `type`, `analysis_id`, or `created_at` at the root are
historical illustrations and do not define a current serialized shape.

The schemas for individual kinds are defined by the OpenSpec changes that
introduce those resources.

## Non-Decisions

This ADR does not define:

- the complete contents of `metadata`
- any resource-specific `spec` or `status` schema
- a migration command for older YAML files
- schemas for repository configuration that is not a CaseGraph resource
- a generic Kubernetes API server or Kubernetes dependency

## Consequences

Every CaseGraph resource has one deterministic dispatch boundary. Readers can
select a schema from `apiVersion` and `kind`, validate the whole envelope, and
reject misplaced or invented fields before using the resource.

Existing CaseGraph resource writers must eventually move their kind-specific
fields under `spec`. That behavior requires OpenSpec and tests before the
writers change.
