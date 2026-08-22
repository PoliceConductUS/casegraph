# Strict CaseGraph Resource Envelopes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development to implement this plan task-by-task.
> Every production change follows superpowers:test-driven-development and every
> task receives spec-compliance and code-quality review before the next task.

**Goal:** Provide Issue #40's strict kind-specific CaseGraph resource
reader/writer boundary, global CUID2 resource references, duplicate-UID
rejection, and deterministic YAML creation.

**Architecture:** A global UID module owns resource identity. A kind-definition
factory constructs complete strict Zod envelopes, while a registry uses only
raw `apiVersion` and `kind` selectors before delegating full validation and
serialization to one concrete definition. A file-document module performs YAML
I/O through that registry and creates resources exclusively.

**Tech Stack:** Node.js 26, TypeScript 6, Vitest 4, Zod 4, YAML 2,
`@paralleldrive/cuid2` 3.

**Spec:**
`openspec/changes/enforce-strict-resource-envelopes/specs/case-resources/spec.md`

## Global Constraints

- The API version is exactly `casegraph.policeconduct.org/v1alpha1`.
- No generic catch-all resource schema is permitted.
- Nodes and legal-effect edges use one resource UID type and namespace.
- Only `Case` is a production resource kind in this change.
- Legacy workspace readers, commands, and serialized shapes remain unchanged.
- No migration, storage layout, traversal, graph mutation, or compatibility
  behavior is added.
- Run a genuine RED before production code for every task.
- Use Conventional Commits and push every commit immediately.

---

### Task 1: Global Resource UIDs And References

**Files:**

- Create: `src/resources/resource-uid.test.ts`
- Create: `src/resources/resource-uid.ts`
- Modify: `openspec/changes/enforce-strict-resource-envelopes/tasks.md`

**Interfaces:**

- Produces:
  `ResourceUidSchema`, `ResourceUid`, `parseResourceReference(value)`, and
  `assertUniqueResourceUids(resources)`.
- Consumes: `isCuid` from the existing `@paralleldrive/cuid2` dependency and
  `z` from the existing `zod` dependency.

- [ ] **Step 1: Write focused failing UID tests**

Create `src/resources/resource-uid.test.ts` with literal expectations covering
the break that invalid, composite, or duplicate identities could be accepted:

```ts
import { describe, expect, test } from "vitest";
import {
  assertUniqueResourceUids,
  parseResourceReference,
  ResourceUidSchema,
} from "./resource-uid.js";

const firstUid = "tz4a98xxat96iws9zmbrgj3a";
const secondUid = "n8m2y4v6k9p3q7r5s1t0w2x4";

describe("CaseGraph resource UIDs", () => {
  test("accepts one CUID2 for resource identity and references", () => {
    expect(ResourceUidSchema.parse(firstUid)).toBe(firstUid);
    expect(parseResourceReference(firstUid)).toBe(firstUid);
  });

  test.each(["", "case-1", "tz4a98xxat96iws9zmbrgj3!"])(
    "rejects invalid resource UID %j",
    (value) => expect(() => ResourceUidSchema.parse(value)).toThrow(),
  );

  test("rejects composite resource references", () => {
    expect(() =>
      parseResourceReference({ caseId: "owner/repository", uid: firstUid }),
    ).toThrow();
  });

  test("accepts unique UIDs across different kinds", () => {
    expect(() =>
      assertUniqueResourceUids([
        { kind: "Case", metadata: { uid: firstUid } },
        { kind: "Filed", metadata: { uid: secondUid } },
      ]),
    ).not.toThrow();
  });

  test("rejects a duplicate UID across different kinds", () => {
    expect(() =>
      assertUniqueResourceUids([
        { kind: "Case", metadata: { uid: firstUid } },
        { kind: "Filed", metadata: { uid: firstUid } },
      ]),
    ).toThrow(`Duplicate CaseGraph resource UID: ${firstUid}`);
  });
});
```

- [ ] **Step 2: Run the focused test and record RED**

Run:

```sh
npm test -- src/resources/resource-uid.test.ts
```

Expected: FAIL because `src/resources/resource-uid.ts` does not exist.

- [ ] **Step 3: Implement the minimal UID contract**

Create `src/resources/resource-uid.ts`:

```ts
import { isCuid } from "@paralleldrive/cuid2";
import { z } from "zod";

export const ResourceUidSchema = z
  .string()
  .refine(isCuid, "CaseGraph resource UID must be a CUID2");

export type ResourceUid = z.infer<typeof ResourceUidSchema>;

export function parseResourceReference(value: unknown): ResourceUid {
  return ResourceUidSchema.parse(value);
}

export function assertUniqueResourceUids(
  resources: readonly {
    readonly kind: string;
    readonly metadata: { readonly uid: string };
  }[],
): void {
  const seen = new Set<ResourceUid>();

  for (const resource of resources) {
    const uid = ResourceUidSchema.parse(resource.metadata.uid);
    if (seen.has(uid)) {
      throw new Error(`Duplicate CaseGraph resource UID: ${uid}`);
    }
    seen.add(uid);
  }
}
```

- [ ] **Step 4: Run the focused test and record GREEN**

Run `npm test -- src/resources/resource-uid.test.ts`.

Expected: 5 tests pass with no warnings.

- [ ] **Step 5: Mark the coarse UID tasks complete**

Change Tasks 1.1 and 1.2 in `tasks.md` from `- [ ]` to `- [x]`.

- [ ] **Step 6: Commit and push immediately**

```sh
git add src/resources/resource-uid.ts src/resources/resource-uid.test.ts \
  openspec/changes/enforce-strict-resource-envelopes/tasks.md
git commit -m "feat(resources): validate global resource UIDs"
git push
```

### Task 2: Strict Kind Definitions And Registry Dispatch

**Files:**

- Create: `src/resources/resource-kind.test.ts`
- Create: `src/resources/resource-kind.ts`
- Create: `src/resources/case/case-resource.ts`
- Modify: `openspec/changes/enforce-strict-resource-envelopes/tasks.md`

**Interfaces:**

- Consumes: `ResourceUidSchema` from Task 1.
- Produces: `CASEGRAPH_RESOURCE_API_VERSION`, `defineResourceKind(options)`,
  `ResourceKindDefinition`, `createResourceRegistry(definitions)`,
  `CaseResourceDefinition`, and `CaseResourceRegistry`.
- The registry exposes `read(value, resourcePath)` and
  `serialize(value, resourcePath)`; both return or emit only values accepted by
  the selected concrete definition.

- [ ] **Step 1: Write focused failing strict-envelope tests**

Create `src/resources/resource-kind.test.ts`. Use one literal valid `Case`
value and a test-only `ObservedResource` definition whose strict status shape
is `{ phase: z.enum(["pending", "complete"]) }`. Cover these independent
mutations:

```ts
const validCase = {
  apiVersion: "casegraph.policeconduct.org/v1alpha1",
  kind: "Case",
  metadata: { uid: "tz4a98xxat96iws9zmbrgj3a" },
  spec: {},
};
```

Tests MUST prove:

1. the default registry reads `validCase` exactly;
2. the test-only definition accepts declared `status.phase`;
3. `Case` rejects any `status`;
4. unknown root, metadata, spec, and status fields each fail in separate test
   cases;
5. moving `uid` to the root fails;
6. an unknown API version identifies the version and supplied path;
7. an unknown kind identifies the kind and supplied path;
8. serializing the same valid value twice returns identical bytes; and
9. serialized `Case` YAML parses back to `validCase` through the registry.

Use `z.strictObject` shapes for the test-only spec and status. Do not assert on
private registry structure.

- [ ] **Step 2: Run the focused test and record RED**

Run:

```sh
npm test -- src/resources/resource-kind.test.ts
```

Expected: FAIL because the resource-kind and `Case` modules do not exist.

- [ ] **Step 3: Implement strict kind definitions**

Create `src/resources/resource-kind.ts` with these public contracts:

```ts
export const CASEGRAPH_RESOURCE_API_VERSION =
  "casegraph.policeconduct.org/v1alpha1" as const;

export interface CaseGraphResource {
  readonly apiVersion: typeof CASEGRAPH_RESOURCE_API_VERSION;
  readonly kind: string;
  readonly metadata: { readonly uid: ResourceUid };
  readonly spec: object;
  readonly status?: object;
}

export interface ResourceKindDefinition {
  readonly apiVersion: typeof CASEGRAPH_RESOURCE_API_VERSION;
  readonly kind: string;
  read(value: unknown): CaseGraphResource;
  serialize(value: unknown): string;
}
```

`defineResourceKind` MUST accept a literal `kind`, a Zod raw shape for `spec`,
and an optional Zod raw shape for `status`. It MUST construct the root schema
with `z.strictObject`, construct metadata as
`z.strictObject({ uid: ResourceUidSchema })`, and construct strict spec/status
objects itself. Its `read` method parses unknown input. Its `serialize` method
parses first and passes the validated value to `yaml.stringify`.

`createResourceRegistry` MUST reject duplicate registration keys. Its dispatcher
MUST inspect only whether the unknown input is a non-array object and whether
`apiVersion` and `kind` are strings; it MUST NOT validate or copy any other
field before selecting the exact definition. Missing/unknown selectors and
kind-schema failures MUST identify `resourcePath`.

- [ ] **Step 4: Implement the first concrete Case definition**

Create `src/resources/case/case-resource.ts`:

```ts
import {
  createResourceRegistry,
  defineResourceKind,
} from "../resource-kind.js";

export const CaseResourceDefinition = defineResourceKind({
  kind: "Case",
  spec: {},
});

export const CaseResourceRegistry = createResourceRegistry([
  CaseResourceDefinition,
]);
```

Do not add name, membership, status, timestamps, aliases, or legacy fields.

- [ ] **Step 5: Run the focused tests and record GREEN**

Run:

```sh
npm test -- src/resources/resource-uid.test.ts \
  src/resources/resource-kind.test.ts
```

Expected: both files pass. If Zod inference exposes a type mismatch, fix the
implementation type without weakening a strict runtime schema or using `any`.

- [ ] **Step 6: Mark the coarse kind tasks complete**

Change Tasks 2.1 and 2.2 in `tasks.md` from `- [ ]` to `- [x]`.

- [ ] **Step 7: Commit and push immediately**

```sh
git add src/resources/resource-kind.ts src/resources/resource-kind.test.ts \
  src/resources/case/case-resource.ts \
  openspec/changes/enforce-strict-resource-envelopes/tasks.md
git commit -m "feat(resources): dispatch strict kind schemas"
git push
```

### Task 3: Deterministic Resource File Documents

**Files:**

- Create: `src/resources/resource-document.test.ts`
- Create: `src/resources/resource-document.ts`
- Modify: `openspec/changes/enforce-strict-resource-envelopes/tasks.md`

**Interfaces:**

- Consumes: `CaseResourceRegistry` and the registry interface from Task 2.
- Produces:
  `readResourceDocument(rootPath, registry = CaseResourceRegistry)` and
  `writeResourceDocument(rootPath, value, registry = CaseResourceRegistry)`.

- [ ] **Step 1: Write focused failing file-boundary tests**

Create `src/resources/resource-document.test.ts` using `mkdtemp`, `tmpdir`,
`path.join`, and real filesystem calls. Tests MUST use the literal valid Case
from Task 2 and prove these observable breaks:

1. valid `Case` YAML reads from `root.yaml`;
2. malformed YAML fails with the exact `root.yaml` path in the error;
3. a valid resource writes once and reads back unchanged;
4. two writes of the same resource to two paths produce byte-identical files;
5. an invalid resource creates no file;
6. writing to an existing file fails and preserves its exact original bytes;
7. a writer-selected unknown API version or kind creates no file.

Use `try/finally` cleanup and assert real file bytes and returned resources, not
mocks.

- [ ] **Step 2: Run the focused test and record RED**

Run:

```sh
npm test -- src/resources/resource-document.test.ts
```

Expected: FAIL because `resource-document.ts` does not exist.

- [ ] **Step 3: Implement the reader/writer boundary**

Create `src/resources/resource-document.ts`. `readResourceDocument` MUST:

1. read UTF-8 bytes;
2. parse through `yaml.parseDocument`;
3. reject parser errors with `Invalid CaseGraph resource YAML at <path>:`;
4. pass `document.toJS()` and the path to the registry reader.

`writeResourceDocument` MUST:

1. ask the registry to serialize and validate the unknown value;
2. parse the serialized YAML back through the registry before filesystem I/O;
3. create the destination with `writeFile(rootPath, yaml, { flag: "wx" })`;
4. never catch and replace an existing destination;
5. return `Promise<void>` and leave no temporary or partial file when
   validation fails.

- [ ] **Step 4: Run all focused resource tests and record GREEN**

Run:

```sh
npm test -- src/resources/resource-uid.test.ts \
  src/resources/resource-kind.test.ts \
  src/resources/resource-document.test.ts
```

Expected: all resource tests pass with no warnings.

- [ ] **Step 5: Mark the coarse document tasks complete**

Change Tasks 3.1 and 3.2 in `tasks.md` from `- [ ]` to `- [x]`.

- [ ] **Step 6: Commit and push immediately**

```sh
git add src/resources/resource-document.ts \
  src/resources/resource-document.test.ts \
  openspec/changes/enforce-strict-resource-envelopes/tasks.md
git commit -m "feat(resources): create deterministic YAML documents"
git push
```

### Task 4: Issue #40 Verification And OpenSpec Completion

**Files:**

- Modify: `openspec/changes/enforce-strict-resource-envelopes/tasks.md`
- Create after implementation:
  `openspec/changes/enforce-strict-resource-envelopes/verify.md`
- Create after verification:
  `openspec/changes/enforce-strict-resource-envelopes/retrospective.md`
- Archive after verification:
  `openspec/changes/archive/2026-08-22-enforce-strict-resource-envelopes/`
- Update through archive: `openspec/specs/case-resources/spec.md`

**Interfaces:** None. This task proves and publishes the completed contract.

- [ ] **Step 1: Run focused mutation checks**

Review each realistic mutation from the specification—wrong API version, wrong
kind, unknown field at each level, wrong-section UID, invalid UID, duplicate
UID, composite reference, nondeterministic output, invalid write, and
overwrite—and identify the focused test that fails for it. Add a missing
focused test through RED/GREEN before continuing.

- [ ] **Step 2: Run full repository validation**

Run `npm run validate` outside the IPC-restricted sandbox when necessary.

Expected: formatting and lint pass for every repository file; 0 test failures;
typecheck and build exit 0; all OpenSpec changes/specs pass strict validation.

- [ ] **Step 3: Mark Task 4.1 complete and commit/push**

Change Task 4.1 in `tasks.md` to `- [x]`, then:

```sh
git add .
git commit -m "test(resources): verify strict envelope contracts"
git push
```

Do not create an empty commit when validation required no tracked change.

- [ ] **Step 4: Produce the bridge verification artifact**

Follow `npx openspec instructions verify --change
enforce-strict-resource-envelopes --json` exactly. Record actual commands,
counts, and exit results in `verify.md`; do not claim checks that were not run.

- [ ] **Step 5: Produce the evidence-first retrospective**

After `verify.md` passes, follow `npx openspec instructions retrospective
--change enforce-strict-resource-envelopes --json`. Complete quantitative
evidence and the required analysis before archiving.

- [ ] **Step 6: Mark Task 4.2 complete and archive the change**

Change Task 4.2 to `- [x]`, validate the change, then run:

```sh
npx openspec archive enforce-strict-resource-envelopes -y
```

Confirm the delta is synced into `openspec/specs/case-resources/spec.md` and the
complete change is under
`openspec/changes/archive/2026-08-22-enforce-strict-resource-envelopes/`.

- [ ] **Step 7: Run fresh post-archive validation, commit, and push**

Run `npm run validate` again. Then:

```sh
git add openspec
git commit -m "docs(openspec): archive strict resource envelopes"
git push
```

Only after this push and green PR checks may the draft PR be marked ready for
review.
