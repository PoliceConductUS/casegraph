import { lstat, realpath } from "node:fs/promises";
import {
  isAbsolute,
  join,
  relative,
  resolve as resolvePath,
  sep,
} from "node:path";
import { inspectResourceDocument } from "../resource-document.js";
import type { ResourceInspection, ResourceRegistry } from "../resource-kind.js";
import { parseResourceReference, type ResourceUid } from "../resource-uid.js";

export interface CaseHomeResourceSnapshot {
  readonly count: number;
  resolve(value: unknown): ResourceInspection;
}

function isMissingPathError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

function isContainedPath(parentPath: string, childPath: string): boolean {
  const relativePath = relative(parentPath, childPath);
  return (
    relativePath === "" ||
    (relativePath !== ".." &&
      !relativePath.startsWith(`..${sep}`) &&
      !isAbsolute(relativePath))
  );
}

async function validateOwnedPath(
  ownedPath: string,
  resourceFolder: string,
  realResourceFolder: string,
  uid: ResourceUid,
  resourcePath: string,
): Promise<string> {
  const rawSegments = ownedPath.split(/[\\/]/u);
  if (
    ownedPath.length === 0 ||
    ownedPath.startsWith("/") ||
    ownedPath.startsWith("\\") ||
    isAbsolute(ownedPath) ||
    rawSegments.includes("..")
  ) {
    throw new Error(
      `Invalid owned path ${JSON.stringify(ownedPath)} for resource ${uid} at ${resourcePath}`,
    );
  }

  const segments = rawSegments.filter(
    (segment) => segment !== "" && segment !== ".",
  );
  if (
    segments.length < 2 ||
    (segments[0] !== "files" && segments[0] !== "audits")
  ) {
    throw new Error(
      `Invalid owned path ${JSON.stringify(ownedPath)} for resource ${uid} at ${resourcePath}`,
    );
  }

  const normalizedPath = resolvePath(resourceFolder, ...segments);
  const ownedDirectory = resolvePath(resourceFolder, segments[0]);
  if (
    normalizedPath === ownedDirectory ||
    !isContainedPath(resourceFolder, normalizedPath)
  ) {
    throw new Error(
      `Invalid owned path ${JSON.stringify(ownedPath)} for resource ${uid} at ${resourcePath}`,
    );
  }

  let existingPath = resourceFolder;
  for (const segment of segments) {
    existingPath = join(existingPath, segment);
    try {
      const realExistingPath = await realpath(existingPath);
      if (!isContainedPath(realResourceFolder, realExistingPath)) {
        throw new Error(
          `Owned path escapes resource ${uid} at ${normalizedPath}`,
        );
      }
    } catch (error) {
      if (isMissingPathError(error)) {
        try {
          await lstat(existingPath);
        } catch (lstatError) {
          if (isMissingPathError(lstatError)) {
            break;
          }
          throw lstatError;
        }
        throw new Error(
          `Owned path containment is indeterminate for resource ${uid} at ${normalizedPath}`,
        );
      }
      throw error;
    }
  }

  return normalizedPath;
}

async function normalizeOwnedPaths(
  inspection: ResourceInspection,
  resourceFolder: string,
  resourcePath: string,
): Promise<ResourceInspection> {
  const uid = parseResourceReference(inspection.resource.metadata.uid);
  const realResourceFolder =
    inspection.ownedPaths.length === 0
      ? resourceFolder
      : await realpath(resourceFolder);
  const ownedPaths = await Promise.all(
    inspection.ownedPaths.map((ownedPath) =>
      validateOwnedPath(
        ownedPath,
        resourceFolder,
        realResourceFolder,
        uid,
        resourcePath,
      ),
    ),
  );

  return Object.freeze({
    ...inspection,
    ownedPaths: Object.freeze(ownedPaths),
  });
}

export async function openCaseHomeResources(
  caseHomePath: string,
  registry: ResourceRegistry,
): Promise<CaseHomeResourceSnapshot> {
  const canonicalCaseHomePath = resolvePath(caseHomePath);
  const rootPath = join(canonicalCaseHomePath, "root.yaml");
  const inspectedRoot = await inspectResourceDocument(rootPath, registry);

  if (inspectedRoot.resource.kind !== "Case") {
    throw new Error(`CaseHome root must be a Case resource at ${rootPath}`);
  }

  const members = new Map<ResourceUid, ResourceInspection>();
  const rootUid = parseResourceReference(inspectedRoot.resource.metadata.uid);
  const root = await normalizeOwnedPaths(
    inspectedRoot,
    canonicalCaseHomePath,
    rootPath,
  );
  members.set(rootUid, root);

  const duplicateRootPath = join(canonicalCaseHomePath, rootUid, "root.yaml");
  try {
    const duplicateRoot = await inspectResourceDocument(
      duplicateRootPath,
      registry,
    );
    if (duplicateRoot.resource.metadata.uid === rootUid) {
      throw new Error(
        `Duplicate authoritative CaseHome resource UID ${rootUid} at ${duplicateRootPath}`,
      );
    }
  } catch (error) {
    if (!isMissingPathError(error)) {
      throw error;
    }
  }

  const pending = [...root.resourceReferences];
  for (let index = 0; index < pending.length; index += 1) {
    const uid = pending[index];
    if (members.has(uid)) {
      continue;
    }

    const resourceFolder = join(canonicalCaseHomePath, uid);
    const resourcePath = join(resourceFolder, "root.yaml");
    let inspectedMember: ResourceInspection;
    try {
      inspectedMember = await inspectResourceDocument(resourcePath, registry);
    } catch (error) {
      if (isMissingPathError(error)) {
        throw new Error(`Missing CaseHome resource ${uid} at ${resourcePath}`, {
          cause: error,
        });
      }
      throw error;
    }

    const actualUid = parseResourceReference(
      inspectedMember.resource.metadata.uid,
    );
    if (actualUid !== uid) {
      throw new Error(
        `CaseHome resource UID mismatch at ${resourcePath}: expected ${uid}, actual ${actualUid}`,
      );
    }

    const member = await normalizeOwnedPaths(
      inspectedMember,
      resourceFolder,
      resourcePath,
    );
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
