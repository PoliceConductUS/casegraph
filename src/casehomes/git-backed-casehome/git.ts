import {
  execFileResult,
  type CommandResult,
} from "../../system/external/contract.js";
import os from "node:os";

export type GitRunner = (
  args: readonly string[],
  cwd: string,
) => Promise<CommandResult>;

export function createGitRunner(): GitRunner {
  return (args, cwd) => {
    const env = Object.fromEntries(
      Object.entries(process.env).filter(
        ([key]) => !key.toUpperCase().startsWith("GIT_"),
      ),
    );
    Object.assign(env, {
      GIT_OPTIONAL_LOCKS: "0",
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_GLOBAL: os.devNull,
      LC_ALL: "C",
    });
    return execFileResult("git", args, { cwd, env });
  };
}
