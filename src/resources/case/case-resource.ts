import {
  createResourceRegistry,
  defineResourceKind,
} from "../resource-kind.js";
import { ResourceUidSchema } from "../resource-uid.js";

export const CaseResourceDefinition = defineResourceKind({
  kind: "Case",
  category: "node",
  spec: { resources: ResourceUidSchema.array() },
  resourceReferences: (resource) => resource.spec.resources,
});

export const CaseResourceRegistry = createResourceRegistry([
  CaseResourceDefinition,
]);
