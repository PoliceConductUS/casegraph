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
