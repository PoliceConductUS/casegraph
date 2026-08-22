import {
  execFileResult,
  type CommandResult,
} from "../../system/external/contract.js";

export type GitRunner = (
  args: readonly string[],
  cwd: string,
) => Promise<CommandResult>;

export function createGitRunner(): GitRunner {
  return (args, cwd) => execFileResult("git", args, { cwd });
}
