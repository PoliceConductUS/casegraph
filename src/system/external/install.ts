import { externalTools } from "./registry.js";
import { externalInstallResultMessage } from "./contract.js";

let failed = false;

for (const tool of externalTools) {
  const result = await tool.install();
  console.log(externalInstallResultMessage(result));
  if (result.status === "failed") {
    failed = true;
  }
}

if (failed) {
  process.exitCode = 1;
}
