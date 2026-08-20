import { execFileText, type ExternalTool } from "../contract.js";
import { installWithBrew } from "../brew.js";

export type TesseractInput = {
  imagePath: string;
};

export type TesseractOutput = {
  text: string;
};

export const tesseractTool: ExternalTool<TesseractInput, TesseractOutput> = {
  binary: "tesseract",
  install() {
    return installWithBrew({ installArgs: ["tesseract"], tool: this });
  },
  minimumVersion: "5.0.0",
  parseVersion(output: string): string | undefined {
    return output.match(/^tesseract\s+([^\s]+)/)?.[1];
  },
  async run(input: TesseractInput): Promise<TesseractOutput> {
    return {
      text: await execFileText(
        "tesseract",
        [input.imagePath, "stdout", "--psm", "3"],
        { maxBuffer: 1024 * 1024 * 20 },
      ),
    };
  },
  versionCommand: ["tesseract", "--version"],
};
