import {
  execFileResult,
  externalToolVersion,
  versionSatisfiesMinimum,
  type ExternalInstallResult,
  type ExternalTool,
} from "./contract.js";

export async function installWithBrew<TInput, TOutput>({
  installArgs,
  tool,
}: {
  installArgs: readonly string[];
  tool: ExternalTool<TInput, TOutput>;
}): Promise<ExternalInstallResult> {
  const existingVersion = await externalToolVersion(tool);
  if (existingVersion) {
    if (versionSatisfiesMinimum(existingVersion, tool.minimumVersion)) {
      return {
        binary: tool.binary,
        status: "already-installed",
        version: existingVersion,
      };
    }

    return {
      binary: tool.binary,
      message: `${tool.binary} ${existingVersion} is below required version ${tool.minimumVersion}. Run: brew upgrade ${installArgs.join(" ")}`,
      status: "failed",
      version: existingVersion,
    };
  }

  const install = await execFileResult("brew", ["install", ...installArgs], {
    maxBuffer: 1024 * 1024 * 20,
  });
  if (install.exitCode !== 0) {
    return {
      binary: tool.binary,
      message: install.stderr || install.stdout,
      status: "failed",
    };
  }

  const installedVersion = await externalToolVersion(tool);
  if (!installedVersion) {
    return {
      binary: tool.binary,
      message: `${tool.binary} install finished but the command is still unavailable.`,
      status: "failed",
    };
  }

  if (!versionSatisfiesMinimum(installedVersion, tool.minimumVersion)) {
    return {
      binary: tool.binary,
      message: `${tool.binary} ${installedVersion} is below required version ${tool.minimumVersion}.`,
      status: "failed",
      version: installedVersion,
    };
  }

  return {
    binary: tool.binary,
    status: "installed",
    version: installedVersion,
  };
}
