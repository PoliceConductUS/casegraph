import { randomUUID } from "node:crypto";
import {
  chmod,
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { isMap, isScalar, parseDocument, stringify } from "yaml";

interface RegistrationPublishInput {
  readonly content: string;
  readonly destinationPath: string;
  readonly mode: number;
  readonly temporaryPath: string;
}

type RegistrationPublisher = (input: RegistrationPublishInput) => Promise<void>;

interface RegistrationGuard {
  release(): Promise<void>;
}

type RegistrationGuardAcquirer = (
  guardPath: string,
) => Promise<RegistrationGuard>;

interface CaseHomeRegistrationStoreDependencies {
  readonly acquireGuard?: RegistrationGuardAcquirer;
  readonly publish?: RegistrationPublisher;
  readonly temporaryId?: () => string;
}

interface RegistrationSnapshot {
  readonly mode: number | undefined;
  readonly registrations: ReadonlyMap<string, string>;
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

function errorCode(error: unknown): unknown {
  if (typeof error === "object" && error !== null && "code" in error) {
    return error.code;
  }
  return undefined;
}

function asError(error: unknown): Error {
  if (error instanceof Error) return error;
  if (typeof error === "string") return new Error(error);
  return new Error("Non-Error CaseHome registration failure", {
    cause: error,
  });
}

function filesystemType(entry: {
  isBlockDevice(): boolean;
  isCharacterDevice(): boolean;
  isDirectory(): boolean;
  isFIFO(): boolean;
  isFile(): boolean;
  isSocket(): boolean;
  isSymbolicLink(): boolean;
}): string {
  if (entry.isSymbolicLink()) return "symbolic link";
  if (entry.isDirectory()) return "directory";
  if (entry.isFIFO()) return "FIFO";
  if (entry.isSocket()) return "socket";
  if (entry.isCharacterDevice()) return "character device";
  if (entry.isBlockDevice()) return "block device";
  if (entry.isFile()) return "regular file";
  return "non-regular entry";
}

function hasCaseHomeRootSuffix(rootPath: string): boolean {
  return (
    path.basename(rootPath) === "root.yaml" &&
    path.basename(path.dirname(rootPath)) === "casegraph"
  );
}

async function requireRegularRoot(
  canonicalRootPath: string,
  registrationPath: string,
  role: "requested" | "stored",
): Promise<void> {
  let rootEntry;
  try {
    rootEntry = await stat(canonicalRootPath);
  } catch (error) {
    throw invalidRegistration(
      registrationPath,
      `${role} root target is unavailable at ${canonicalRootPath}: ${String(error)}`,
    );
  }
  if (!rootEntry.isFile()) {
    throw invalidRegistration(
      registrationPath,
      `${role} root target ${canonicalRootPath} is a ${filesystemType(rootEntry)}, not a regular file`,
    );
  }
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
  await requireRegularRoot(canonicalPath, registrationPath, "stored");
}

async function resolveRequestedRootPath(
  requestedPath: string,
  registrationPath: string,
): Promise<string> {
  let canonicalRootPath: string;
  try {
    canonicalRootPath = await realpath(requestedPath);
  } catch (error) {
    throw invalidRegistration(
      registrationPath,
      `requested root path is missing or not real: ${requestedPath}; ${String(error)}`,
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
  await requireRegularRoot(canonicalRootPath, registrationPath, "requested");
  return canonicalRootPath;
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

async function publishRegistrationAtomically({
  content,
  destinationPath,
  mode,
  temporaryPath,
}: RegistrationPublishInput): Promise<void> {
  await writeFile(temporaryPath, content, { flag: "wx", mode });
  await chmod(temporaryPath, mode);
  await rename(temporaryPath, destinationPath);
}

async function acquireRegistrationGuard(
  guardPath: string,
): Promise<RegistrationGuard> {
  const guardHandle = await open(guardPath, "wx", 0o600);
  return {
    async release(): Promise<void> {
      await guardHandle.close();
      await unlink(guardPath);
    },
  };
}

function compareCaseIds(
  [left]: readonly [string, string],
  [right]: readonly [string, string],
): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function cleanupFailure(input: {
  readonly cleanupError: Error;
  readonly guardPath: string;
  readonly primaryError: Error | undefined;
  readonly published: boolean;
}): Error {
  const cleanupDiagnostic = `guard cleanup diagnostic at ${input.guardPath}: ${input.cleanupError.toString()}; retained guard path ${input.guardPath}; registry published: ${String(input.published)}`;
  if (input.primaryError !== undefined) {
    return new Error(
      `CaseHome registration operation failed; primary diagnostic: ${input.primaryError.toString()}; ${cleanupDiagnostic}`,
      {
        cause: new AggregateError(
          [input.primaryError, input.cleanupError],
          "Registration and guard cleanup both failed",
        ),
      },
    );
  }
  return new Error(`CaseHome registration ${cleanupDiagnostic}`, {
    cause: input.cleanupError,
  });
}

export class CaseHomeRegistrationStore {
  readonly #acquireGuard: RegistrationGuardAcquirer;
  readonly #publish: RegistrationPublisher;
  readonly #temporaryId: () => string;

  constructor(dependencies: CaseHomeRegistrationStoreDependencies = {}) {
    this.#acquireGuard = dependencies.acquireGuard ?? acquireRegistrationGuard;
    this.#publish = dependencies.publish ?? publishRegistrationAtomically;
    this.#temporaryId = dependencies.temporaryId ?? randomUUID;
  }

  async #readSnapshot(configHome: string): Promise<RegistrationSnapshot> {
    const registrationPath = path.join(configHome, "casehomes.yaml");
    let registryEntry;
    try {
      registryEntry = await lstat(registrationPath);
    } catch (error) {
      if (errorCode(error) === "ENOENT") {
        return {
          mode: undefined,
          registrations: new ImmutableRegistrationMap(new Map()),
        };
      }
      throw invalidRegistration(
        registrationPath,
        `cannot inspect registry entry: ${String(error)}`,
      );
    }
    if (!registryEntry.isFile()) {
      throw invalidRegistration(
        registrationPath,
        `registry entry is a ${filesystemType(registryEntry)}, not a regular file`,
      );
    }

    let content: string;
    try {
      content = await readFile(registrationPath, "utf8");
    } catch (error) {
      throw invalidRegistration(
        registrationPath,
        `cannot read document: ${String(error)}`,
      );
    }
    return {
      mode: registryEntry.mode & 0o777,
      registrations: await parseRegistrationDocument(content, registrationPath),
    };
  }

  async read(configHome: string): Promise<ReadonlyMap<string, string>> {
    return (await this.#readSnapshot(configHome)).registrations;
  }

  async register(input: {
    readonly configHome: string;
    readonly caseId: string;
    readonly rootPath: string;
  }): Promise<"created" | "unchanged"> {
    const registrationPath = path.join(input.configHome, "casehomes.yaml");
    const guardPath = `${registrationPath}.lock`;
    const canonicalRootPath = await resolveRequestedRootPath(
      input.rootPath,
      registrationPath,
    );
    await mkdir(input.configHome, { recursive: true });

    let guard: RegistrationGuard;
    try {
      guard = await this.#acquireGuard(guardPath);
    } catch (error) {
      if (errorCode(error) === "EEXIST") {
        throw new Error(
          `CaseHome registration contention at ${guardPath}: guard already exists; ${String(error)}`,
          { cause: error },
        );
      }
      throw new Error(
        `Failed to acquire CaseHome registration guard at ${guardPath}: ${String(error)}`,
        { cause: error },
      );
    }

    let primaryError: Error | undefined;
    let published = false;
    let result: "created" | "unchanged" | undefined;
    try {
      const snapshot = await this.#readSnapshot(input.configHome);
      const existingRootPath = snapshot.registrations.get(input.caseId);
      if (existingRootPath === canonicalRootPath) {
        result = "unchanged";
      } else {
        if (existingRootPath !== undefined) {
          throw new Error(
            `CaseHome registration conflict at ${registrationPath}: case ID ${input.caseId} already maps to ${existingRootPath}; requested ${canonicalRootPath}`,
          );
        }
        for (const [
          existingCaseId,
          registeredRootPath,
        ] of snapshot.registrations) {
          if (registeredRootPath === canonicalRootPath) {
            throw new Error(
              `CaseHome registration conflict at ${registrationPath}: root path ${canonicalRootPath} already maps from ${existingCaseId}; requested ${input.caseId}`,
            );
          }
        }

        const nextRegistrations = new Map(snapshot.registrations);
        nextRegistrations.set(input.caseId, canonicalRootPath);
        const sortedEntries = [...nextRegistrations].sort(compareCaseIds);
        const content = stringify(Object.fromEntries(sortedEntries));
        await parseRegistrationDocument(content, registrationPath);
        const temporaryPath = path.join(
          input.configHome,
          `.casehomes.yaml.${this.#temporaryId()}.tmp`,
        );
        try {
          await this.#publish({
            content,
            destinationPath: registrationPath,
            mode: snapshot.mode ?? 0o600,
            temporaryPath,
          });
        } catch (error) {
          throw new Error(
            `Failed to publish CaseHome registration at ${registrationPath}; unpublished temporary path ${temporaryPath}: ${String(error)}`,
            { cause: error },
          );
        }
        published = true;
        result = "created";
      }
    } catch (error) {
      primaryError = asError(error);
    }

    let guardCleanupError: Error | undefined;
    try {
      await guard.release();
    } catch (error) {
      guardCleanupError = asError(error);
    }
    if (guardCleanupError !== undefined) {
      throw cleanupFailure({
        cleanupError: guardCleanupError,
        guardPath,
        primaryError,
        published,
      });
    }
    if (primaryError !== undefined) throw primaryError;
    if (result === undefined) {
      throw new Error(
        `CaseHome registration at ${registrationPath} completed without a result`,
      );
    }
    return result;
  }
}
