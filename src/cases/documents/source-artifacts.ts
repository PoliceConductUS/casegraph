import { constants } from "node:fs";
import { access, mkdir, open, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { PDFParse } from "pdf-parse";

export async function readablePdf(
  filePath: string | undefined,
): Promise<boolean> {
  if (!filePath) {
    return false;
  }

  try {
    await access(filePath, constants.R_OK);
    const file = await open(filePath, "r");
    try {
      const signature = Buffer.alloc(5);
      const { bytesRead } = await file.read(signature, 0, signature.length, 0);
      return (
        bytesRead === signature.length && signature.toString("utf8") === "%PDF-"
      );
    } finally {
      await file.close();
    }
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === "ENOENT" || nodeError.code === "EACCES") {
      return false;
    }

    throw error;
  }
}

export async function downloadPdfArtifact({
  destinationPath,
  downloadUrl,
}: {
  destinationPath: string;
  downloadUrl: string;
}): Promise<boolean> {
  const response = await fetch(downloadUrl);

  if (!response.ok) {
    return false;
  }

  await mkdir(path.dirname(destinationPath), { recursive: true });
  await writeFile(destinationPath, Buffer.from(await response.arrayBuffer()), {
    flag: "wx",
  });

  return readablePdf(destinationPath);
}

export async function writeTextArtifact({
  destinationPath,
  id,
  metadata,
  text,
}: {
  destinationPath: string;
  id: string;
  metadata?: Record<string, string>;
  text: string;
}): Promise<void> {
  await mkdir(path.dirname(destinationPath), { recursive: true });
  await writeFile(
    destinationPath,
    markdownTextArtifact({ id, metadata, text }),
    {
      flag: "wx",
    },
  );
}

export function markdownTextArtifact({
  id,
  metadata = {},
  text,
}: {
  id: string;
  metadata?: Record<string, string>;
  text: string;
}): string {
  const metadataLines = Object.entries(metadata)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
    .join("\n");
  const normalizedText = text.replace(/\r\n/g, "\n").replace(/\n*$/u, "\n");

  return [
    'type: "node"',
    'kind: "markdown"',
    `id: ${JSON.stringify(id)}`,
    metadataLines,
    "text: |-",
    ...normalizedText.split("\n").map((line) => `  ${line}`),
    "",
  ].join("\n");
}

export function readMarkdownTextArtifact(markdown: string): string {
  const lines = markdown.split(/\r?\n/u);
  const textIndex = lines.findIndex((line) => line === "text: |-");
  if (textIndex === -1) {
    return markdown;
  }

  return lines
    .slice(textIndex + 1)
    .filter((line) => line.startsWith("  "))
    .map((line) => line.slice(2))
    .join("\n")
    .replace(/\n*$/u, "\n");
}

export function isUsableExtractedPdfText(text: string): boolean {
  const nonHeaderText = text
    .split(/\r?\n/)
    .filter((line) => {
      const trimmed = line.trim();
      return (
        trimmed.length > 0 &&
        !/^Case .+ Document .+ Filed .+ Page \d+ of \d+ PageID \d+$/i.test(
          trimmed,
        ) &&
        !/^-- \d+ of \d+ --$/.test(trimmed)
      );
    })
    .join("\n");

  return nonHeaderText.replace(/\s/g, "").length >= 500;
}

export async function extractPdfTextArtifact({
  destinationPath,
  id,
  pdfPath,
}: {
  destinationPath: string;
  id: string;
  pdfPath: string;
}): Promise<boolean> {
  let parser: PDFParse;
  try {
    parser = new PDFParse({ data: await readFile(pdfPath) });
  } catch {
    return false;
  }

  try {
    const probeResult = await parser.getText({ first: 2 });
    if (!isUsableExtractedPdfText(probeResult.text)) {
      return false;
    }

    const result = await parser.getText();
    await writeTextArtifact({
      destinationPath,
      id,
      metadata: { artifact: "extracted-pdf-text", method: "native-text" },
      text: result.text,
    });
    return true;
  } catch {
    return false;
  } finally {
    await parser.destroy();
  }
}
