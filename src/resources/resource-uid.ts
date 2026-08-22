import { isCuid } from "@paralleldrive/cuid2";
import { z } from "zod";

export const ResourceUidSchema = z
  .string()
  .refine(isCuid, "CaseGraph resource UID must be a CUID2")
  .brand<"ResourceUid">();

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
