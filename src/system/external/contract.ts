import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type ExternalInstallResult =
  | {
      binary: string;
      status: "already-installed" | "installed";
      version: string;
    }
  | {
      binary: string;
      message: string;
      status: "failed";
      version?: string;
    };

export type ExternalTool<TInput, TOutput> = {
  binary: string;
  install: () => Promise<ExternalInstallResult>;
  minimumVersion: string;
  parseVersion: (output: string) => string | undefined;
  run: (input: TInput) => Promise<TOutput>;
  versionCommand: readonly string[];
};

export type CommandResult = {
  exitCode: number;
  stderr: string;
  stdout: string;
};

export async function execFileResult(
  command: string,
  args: readonly string[],
  options: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    maxBuffer?: number;
    timeout?: number;
  } = {},
): Promise<CommandResult> {
  try {
    const { stdout, stderr } = await execFileAsync(command, [...args], options);
    return { exitCode: 0, stdout, stderr };
  } catch (error) {
    const failure = error as Error & {
      code?: number;
      killed?: boolean;
      signal?: NodeJS.Signals;
      stderr?: string;
      stdout?: string;
    };
    const timedOut =
      options.timeout !== undefined &&
      failure.killed === true &&
      failure.signal !== undefined;

    return {
      exitCode: typeof failure.code === "number" ? failure.code : 1,
      stdout: failure.stdout ?? "",
      stderr: timedOut
        ? `${command} timed out after ${String(options.timeout)}ms`
        : (failure.stderr ?? failure.message),
    };
  }
}

export async function execFileText(
  command: string,
  args: readonly string[],
  options: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    maxBuffer?: number;
    timeout?: number;
  } = {},
): Promise<string> {
  const result = await execFileResult(command, args, options);
  if (result.exitCode !== 0) {
    throw new Error(
      result.stderr || `${command} exited ${String(result.exitCode)}`,
    );
  }

  return result.stdout;
}

export async function externalToolVersion(
  tool: Pick<ExternalTool<unknown, unknown>, "parseVersion" | "versionCommand">,
  env?: NodeJS.ProcessEnv,
): Promise<string | undefined> {
  const [command, ...args] = tool.versionCommand;
  if (!command) {
    return undefined;
  }

  const result = await execFileResult(command, args, {
    env,
    timeout: 10_000,
  });
  if (result.exitCode !== 0) {
    return undefined;
  }

  return tool.parseVersion(`${result.stdout}\n${result.stderr}`);
}

export function versionSatisfiesMinimum(
  version: string,
  minimumVersion: string,
): boolean {
  const actual = numericVersionParts(version);
  const minimum = numericVersionParts(minimumVersion);
  const length = Math.max(actual.length, minimum.length);

  for (let index = 0; index < length; index += 1) {
    const actualPart = actual[index] ?? 0;
    const minimumPart = minimum[index] ?? 0;

    if (actualPart > minimumPart) {
      return true;
    }

    if (actualPart < minimumPart) {
      return false;
    }
  }

  return true;
}

export function installCommandText(command: readonly string[]): string {
  return command.join(" ");
}

export function externalInstallResultMessage(
  result: ExternalInstallResult,
): string {
  if (result.status === "failed") {
    return `✗ ${result.binary}: ${result.message}`;
  }

  return `✓ ${result.binary}: ${result.status} (${result.version})`;
}

function numericVersionParts(version: string): number[] {
  return version
    .split(/[^\d]+/)
    .filter(Boolean)
    .map((part) => Number(part));
}
