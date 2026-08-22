import { randomUUID } from "node:crypto";
import { mkdir, readFile, realpath, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { isMap, isScalar, parseDocument, stringify } from "yaml";

export interface RegistrationPublishInput {
  readonly content: string;
  readonly destinationPath: string;
  readonly temporaryPath: string;
}

export type RegistrationPublisher = (
  input: RegistrationPublishInput,
) => Promise<void>;

interface CaseHomeRegistrationStoreDependencies {
  readonly publish?: RegistrationPublisher;
}

class ImmutableRegistrationMap implements ReadonlyMap<string, string> {
  readonly #registrations: ReadonlyMap<string, string>;

  constructor(registrations: ReadonlyMap<string, string>) {
    this.#registrations = new Map(registrations);
    Object.freeze(this);
  }

  get size(): number {
    return this.#registrations.size;
  }

  entries(): MapIterator<[string, string]> {
    return this.#registrations.entries();
  }

  forEach(
    callback: (
      value: string,
      key: string,
      map: ReadonlyMap<string, string>,
    ) => void,
    thisArg?: unknown,
  ): void {
    this.#registrations.forEach((value, key) => {
      callback.call(thisArg, value, key, this);
    });
  }

  get(key: string): string | undefined {
    return this.#registrations.get(key);
  }

  has(key: string): boolean {
    return this.#registrations.has(key);
  }

  keys(): MapIterator<string> {
    return this.#registrations.keys();
  }

  values(): MapIterator<string> {
    return this.#registrations.values();
  }

  [Symbol.iterator](): MapIterator<[string, string]> {
    return this.entries();
  }
}

function invalidRegistration(registrationPath: string, detail: string): Error {
  return new Error(
    `Invalid CaseHome registration at ${registrationPath}: ${detail}`,
  );
}

function hasCaseHomeRootSuffix(rootPath: string): boolean {
  return (
    path.basename(rootPath) === "root.yaml" &&
    path.basename(path.dirname(rootPath)) === "casegraph"
  );
}

async function validateStoredRootPath(
  storedPath: string,
  registrationPath: string,
): Promise<void> {
  if (!path.isAbsolute(storedPath)) {
    throw invalidRegistration(
      registrationPath,
      `stored root path is not absolute: ${storedPath}`,
    );
  }

  if (!hasCaseHomeRootSuffix(storedPath)) {
    throw invalidRegistration(
      registrationPath,
      `stored root path must end in casegraph/root.yaml: ${storedPath}`,
    );
  }

  let canonicalPath: string;
  try {
    canonicalPath = await realpath(storedPath);
  } catch (error) {
    throw invalidRegistration(
      registrationPath,
      `stored root path is missing or not real: ${storedPath}; ${String(error)}`,
    );
  }

  if (canonicalPath !== storedPath) {
    throw invalidRegistration(
      registrationPath,
      `stored root path is not canonical: ${storedPath}; real path is ${canonicalPath}`,
    );
  }
}

async function parseRegistrationDocument(
  content: string,
  registrationPath: string,
): Promise<ReadonlyMap<string, string>> {
  const document = parseDocument(content, { uniqueKeys: true });
  if (document.errors.length > 0) {
    throw invalidRegistration(registrationPath, document.errors[0].message);
  }

  if (!isMap(document.contents)) {
    throw invalidRegistration(
      registrationPath,
      "document root must be a mapping",
    );
  }

  const registrations = new Map<string, string>();
  const rootOwners = new Map<string, string>();
  for (const pair of document.contents.items) {
    if (!isScalar(pair.key) || typeof pair.key.value !== "string") {
      throw invalidRegistration(
        registrationPath,
        "mapping keys must be strings",
      );
    }
    if (!isScalar(pair.value) || typeof pair.value.value !== "string") {
      throw invalidRegistration(
        registrationPath,
        "mapping values must be strings",
      );
    }

    const caseId = pair.key.value;
    const rootPath = pair.value.value;
    await validateStoredRootPath(rootPath, registrationPath);

    const existingOwner = rootOwners.get(rootPath);
    if (existingOwner !== undefined) {
      throw invalidRegistration(
        registrationPath,
        `root path ${rootPath} is mapped from both ${existingOwner} and ${caseId}`,
      );
    }

    registrations.set(caseId, rootPath);
    rootOwners.set(rootPath, caseId);
  }

  return new ImmutableRegistrationMap(registrations);
}

export async function publishRegistrationAtomically({
  content,
  destinationPath,
  temporaryPath,
}: RegistrationPublishInput): Promise<void> {
  await writeFile(temporaryPath, content, { flag: "wx" });
  await rename(temporaryPath, destinationPath);
}

function compareCaseIds(
  [left]: readonly [string, string],
  [right]: readonly [string, string],
): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

export class CaseHomeRegistrationStore {
  readonly #publish: RegistrationPublisher;

  constructor(dependencies: CaseHomeRegistrationStoreDependencies = {}) {
    this.#publish = dependencies.publish ?? publishRegistrationAtomically;
  }

  async read(configHome: string): Promise<ReadonlyMap<string, string>> {
    const registrationPath = path.join(configHome, "casehomes.yaml");
    let content: string;
    try {
      content = await readFile(registrationPath, "utf8");
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        return new ImmutableRegistrationMap(new Map());
      }
      throw invalidRegistration(
        registrationPath,
        `cannot read document: ${String(error)}`,
      );
    }

    return parseRegistrationDocument(content, registrationPath);
  }

  async register(input: {
    readonly configHome: string;
    readonly caseId: string;
    readonly rootPath: string;
  }): Promise<"created" | "unchanged"> {
    const registrationPath = path.join(input.configHome, "casehomes.yaml");
    const registrations = await this.read(input.configHome);

    let canonicalRootPath: string;
    try {
      canonicalRootPath = await realpath(input.rootPath);
    } catch (error) {
      throw invalidRegistration(
        registrationPath,
        `requested root path is missing or not real: ${input.rootPath}; ${String(error)}`,
      );
    }
    if (
      !path.isAbsolute(canonicalRootPath) ||
      !hasCaseHomeRootSuffix(canonicalRootPath)
    ) {
      throw invalidRegistration(
        registrationPath,
        `requested real root path must be absolute and end in casegraph/root.yaml: ${canonicalRootPath}`,
      );
    }

    const existingRootPath = registrations.get(input.caseId);
    if (existingRootPath === canonicalRootPath) {
      return "unchanged";
    }
    if (existingRootPath !== undefined) {
      throw new Error(
        `CaseHome registration conflict at ${registrationPath}: case ID ${input.caseId} already maps to ${existingRootPath}; requested ${canonicalRootPath}`,
      );
    }

    for (const [existingCaseId, registeredRootPath] of registrations) {
      if (registeredRootPath === canonicalRootPath) {
        throw new Error(
          `CaseHome registration conflict at ${registrationPath}: root path ${canonicalRootPath} already maps from ${existingCaseId}; requested ${input.caseId}`,
        );
      }
    }

    const nextRegistrations = new Map(registrations);
    nextRegistrations.set(input.caseId, canonicalRootPath);
    const sortedEntries = [...nextRegistrations].sort(compareCaseIds);
    const content = stringify(Object.fromEntries(sortedEntries));
    await parseRegistrationDocument(content, registrationPath);

    await mkdir(input.configHome, { recursive: true });
    const temporaryPath = path.join(
      input.configHome,
      `.casehomes.yaml.${randomUUID()}.tmp`,
    );

    try {
      await this.#publish({
        content,
        destinationPath: registrationPath,
        temporaryPath,
      });
    } catch (error) {
      throw new Error(
        `Failed to publish CaseHome registration at ${registrationPath}; unpublished temporary path ${temporaryPath}: ${String(error)}`,
      );
    }

    return "created";
  }
}
