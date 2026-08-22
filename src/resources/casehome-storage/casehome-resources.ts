import { join } from "node:path";
import { readResourceDocument } from "../resource-document.js";
import type { ResourceInspection, ResourceRegistry } from "../resource-kind.js";
import { parseResourceReference, type ResourceUid } from "../resource-uid.js";

export interface CaseHomeResourceSnapshot {
  readonly count: number;
  resolve(value: unknown): ResourceInspection;
}

async function inspectResourceDocument(
  resourcePath: string,
  registry: ResourceRegistry,
): Promise<ResourceInspection> {
  const resource = await readResourceDocument(resourcePath, registry);
  return registry.inspect(resource, resourcePath);
}

export async function openCaseHomeResources(
  caseHomePath: string,
  registry: ResourceRegistry,
): Promise<CaseHomeResourceSnapshot> {
  const rootPath = join(caseHomePath, "root.yaml");
  const root = await inspectResourceDocument(rootPath, registry);

  if (root.resource.kind !== "Case") {
    throw new Error(`CaseHome root must be a Case resource at ${rootPath}`);
  }

  const members = new Map<ResourceUid, ResourceInspection>();
  const rootUid = parseResourceReference(root.resource.metadata.uid);
  members.set(rootUid, root);

  const pending = [...root.resourceReferences];
  for (let index = 0; index < pending.length; index += 1) {
    const uid = pending[index];
    if (members.has(uid)) {
      continue;
    }

    const resourcePath = join(caseHomePath, uid, "root.yaml");
    const member = await inspectResourceDocument(resourcePath, registry);
    members.set(uid, member);
    pending.push(...member.resourceReferences);
  }

  return Object.freeze({
    count: members.size,
    resolve(value: unknown): ResourceInspection {
      const uid = parseResourceReference(value);
      const member = members.get(uid);
      if (member === undefined) {
        throw new Error(
          `Resource UID is not a member of this CaseHome: ${uid}`,
        );
      }
      return member;
    },
  });
}
