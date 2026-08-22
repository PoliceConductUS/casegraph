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
