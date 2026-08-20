import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { PDFParse } from "pdf-parse";
import { externalToolVersion } from "../../../../system/external/contract.js";
import { tesseractTool } from "../../../../system/external/tesseract/index.js";
import {
  openAiApiKey,
  openAiResponsesText,
} from "../../../../system/ai/openai/responses.js";
import {
  extractPdfTextArtifact,
  isUsableExtractedPdfText,
  readablePdf,
  writeTextArtifact,
} from "../../../documents/source-artifacts.js";
import {
  pdfToMarkdownExtractionYaml,
  pdfToMarkdownTaskRunYaml,
  type PdfToMarkdownExtraction,
} from "./contract.js";

export type PdfToMarkdownSource = {
  pdfPath: string;
  plainText?: string;
  recordId: string;
  recordKind: string;
  selectionReason: string;
};

export type PdfToMarkdownOutput = {
  alternateOriginalPdfRelativePath?: "artifacts/original-complaint.pdf";
  markdownArtifactId?: string;
  markdownPath?: string;
  markdownRelativePath?: MarkdownNodeRelativePath;
  pdfPath: string;
  pdfRelativePath: string;
  report: string;
  status: "completed" | "paused";
  taskRunId: string;
  taskRunRelativePath: string;
};

export type PdfToMarkdownVisionExtractor = {
  extractMarkdownFromPageImages: (input: {
    pageImagePaths: readonly string[];
    progress?: (message: string) => void;
  }) => Promise<string>;
};

export type PdfToMarkdownOriginalPdfPrompt = (input: {
  invalidPath?: string;
  unusableNativeTextPath?: string;
  reason: string;
  source: PdfToMarkdownSource;
}) => Promise<string | undefined>;

type MethodAttempt = PdfToMarkdownExtraction["method_attempts"][number];
type MarkdownNodeRelativePath = `artifacts/${string}.yaml`;

function markdownNodeRelativePath(id: string): MarkdownNodeRelativePath {
  return `artifacts/${id}.yaml`;
}

function reportFromExtraction(extraction: PdfToMarkdownExtraction): string {
  return [
    "# PDF To Markdown Report",
    "",
    "## Source",
    "",
    `Source record: ${extraction.source_record_id}.`,
    `PDF path: ${extraction.source_pdf_path}.`,
    "",
    "## Extraction",
    "",
    `Method: ${extraction.method}.`,
    `Status: ${extraction.status}.`,
    `Markdown: ${extraction.markdown_path ?? "not created"}.`,
    `Reason: ${extraction.reason ?? "usable text was created"}.`,
    "",
    "## Attempts",
    "",
    ...extraction.method_attempts.map(
      (attempt) =>
        `- ${attempt.method}: ${attempt.status}${attempt.reason ? ` (${attempt.reason})` : ""}`,
    ),
    "",
  ].join("\n");
}

export async function runPdfToMarkdownWorkflow({
  analysisId,
  caseId,
  env,
  progress,
  promptForOriginalPdfPath,
  source,
  taskRunId,
  timestamp,
  visionExtractor,
  workflowDirectory,
}: {
  analysisId: string;
  caseId: string;
  env?: NodeJS.ProcessEnv;
  progress?: (message: string) => void;
  promptForOriginalPdfPath?: PdfToMarkdownOriginalPdfPrompt;
  source: PdfToMarkdownSource;
  taskRunId: string;
  timestamp: string;
  visionExtractor?: PdfToMarkdownVisionExtractor | null;
  workflowDirectory: string;
}): Promise<PdfToMarkdownOutput> {
  progress?.("pdf-to-markdown: starting task");
  await mkdir(path.join(workflowDirectory, "artifacts"), { recursive: true });
  const taskRunRelativePath =
    `tasks/pdf-to-markdown/${taskRunId}/root.yaml` as const;
  const markdownArtifactId = taskRunId;
  const taskRunDirectory = path.join(
    workflowDirectory,
    "tasks",
    "pdf-to-markdown",
    taskRunId,
  );
  await mkdir(taskRunDirectory, { recursive: true });

  const markdownRelativePath = markdownNodeRelativePath(markdownArtifactId);
  const artifactMarkdownPath = path.join(
    workflowDirectory,
    markdownRelativePath,
  );

  if (!(await readablePdf(source.pdfPath))) {
    throw new Error("The complaint PDF is unavailable.");
  }
  progress?.(`pdf-to-markdown: converting PDF ${source.pdfPath}`);

  let extraction: PdfToMarkdownExtraction;
  let effectivePdfPath = source.pdfPath;
  let effectivePdfRelativePath = source.pdfPath;
  let alternateOriginalPdfRelativePath:
    | "artifacts/original-complaint.pdf"
    | undefined;
  if (await readableExistingMarkdown(artifactMarkdownPath)) {
    progress?.("pdf-to-markdown: using existing markdown artifact");
    extraction = {
      workflow: "pdf-to-markdown",
      source_record_id: source.recordId,
      source_pdf_path: source.pdfPath,
      markdown_path: markdownRelativePath,
      method: "source-metadata",
      status: "completed",
      method_attempts: [
        {
          method: "source-metadata",
          status: "completed",
          reason: "Existing markdown artifact was already available.",
        },
      ],
      source_text_available: true,
    };
  } else if (source.plainText) {
    progress?.("pdf-to-markdown: writing markdown from source text metadata");
    await writeTextArtifact({
      destinationPath: artifactMarkdownPath,
      id: markdownArtifactId,
      metadata: { artifact: "extracted-pdf-text", method: "source-metadata" },
      text: source.plainText,
    });
    extraction = {
      workflow: "pdf-to-markdown",
      source_record_id: source.recordId,
      source_pdf_path: source.pdfPath,
      markdown_path: markdownRelativePath,
      method: "source-metadata",
      status: "completed",
      method_attempts: [
        {
          method: "source-metadata",
          status: "completed",
          reason: "Document metadata already contained complaint text.",
        },
      ],
      source_text_available: true,
    };
  } else {
    progress?.(
      `pdf-to-markdown: extracting native text from ${source.pdfPath}`,
    );
    const nativeTextUsable = await extractPdfTextArtifact({
      destinationPath: artifactMarkdownPath,
      id: markdownArtifactId,
      pdfPath: source.pdfPath,
    });
    const attempts: MethodAttempt[] = [
      {
        method: "native-text",
        status: nativeTextUsable ? "completed" : "failed",
        reason: nativeTextUsable
          ? "Native PDF text extraction produced usable body text."
          : "Native PDF text extraction did not produce usable body text.",
      },
    ];

    if (nativeTextUsable) {
      extraction = completedExtraction({
        attempts,
        markdownPath: markdownRelativePath,
        method: "native-text",
        nativeTextUsable,
        source,
      });
    } else {
      const alternateOriginal = await tryAlternateOriginalPdf({
        artifactMarkdownPath,
        attempts,
        markdownArtifactId,
        markdownRelativePath,
        progress,
        promptForOriginalPdfPath,
        source,
        workflowDirectory,
      });
      if (alternateOriginal) {
        effectivePdfPath = alternateOriginal.pdfPath;
        effectivePdfRelativePath = alternateOriginal.pdfRelativePath;
        alternateOriginalPdfRelativePath =
          alternateOriginal.alternateOriginalPdfRelativePath;
      }

      if (alternateOriginal?.extraction) {
        extraction = alternateOriginal.extraction;
      } else {
        const fallbackSource =
          alternateOriginal === undefined
            ? source
            : { ...source, pdfPath: alternateOriginal.pdfPath };
        extraction = await runOcrAndVisionFallbacks({
          artifactMarkdownPath,
          attempts,
          env,
          markdownArtifactId,
          markdownRelativePath,
          progress,
          source: fallbackSource,
          visionExtractor,
          workflowDirectory,
        });
      }
    }
  }

  const report = reportFromExtraction(extraction);
  await writeFile(
    path.join(
      workflowDirectory,
      "artifacts",
      "pdf-to-markdown-extraction.yaml",
    ),
    pdfToMarkdownExtractionYaml(extraction),
  );
  await writeFile(path.join(taskRunDirectory, "report.md"), report);
  await writeFile(
    path.join(taskRunDirectory, "root.yaml"),
    pdfToMarkdownTaskRunYaml({
      analysis_id: analysisId,
      case_id: caseId,
      task_id: taskRunId,
      task: "pdf-to-markdown",
      task_version: 1,
      executor: {
        engine: "local",
        ai: "none",
      },
      status: extraction.status,
      started_at: timestamp,
      completed_at: timestamp,
      inputs: {
        source_record_id: source.recordId,
        source_pdf: source.pdfPath,
      },
      outputs: {
        extraction: "artifacts/pdf-to-markdown-extraction.yaml",
        markdown: extraction.markdown_path,
        report: `tasks/pdf-to-markdown/${taskRunId}/report.md`,
      },
      history: [
        { event: "task_run_started", at: timestamp },
        { event: "task_run_completed", at: timestamp },
      ],
    }),
  );

  progress?.("pdf-to-markdown: task completed");
  return {
    alternateOriginalPdfRelativePath,
    markdownArtifactId:
      extraction.markdown_path === undefined ? undefined : markdownArtifactId,
    markdownPath:
      extraction.markdown_path === undefined ? undefined : artifactMarkdownPath,
    markdownRelativePath: extraction.markdown_path as
      | MarkdownNodeRelativePath
      | undefined,
    pdfPath: effectivePdfPath,
    pdfRelativePath: effectivePdfRelativePath,
    report,
    status: extraction.status,
    taskRunId,
    taskRunRelativePath,
  };
}

async function tryAlternateOriginalPdf({
  artifactMarkdownPath,
  attempts,
  markdownArtifactId,
  markdownRelativePath,
  progress,
  promptForOriginalPdfPath,
  source,
  workflowDirectory,
}: {
  artifactMarkdownPath: string;
  attempts: MethodAttempt[];
  markdownArtifactId: string;
  markdownRelativePath: MarkdownNodeRelativePath;
  progress?: (message: string) => void;
  promptForOriginalPdfPath?: PdfToMarkdownOriginalPdfPrompt;
  source: PdfToMarkdownSource;
  workflowDirectory: string;
}): Promise<
  | {
      alternateOriginalPdfRelativePath: "artifacts/original-complaint.pdf";
      extraction?: PdfToMarkdownExtraction;
      pdfPath: string;
      pdfRelativePath: "artifacts/original-complaint.pdf";
    }
  | undefined
> {
  const originalPdfPath = path.join(
    workflowDirectory,
    "artifacts",
    "original-complaint.pdf",
  );
  const originalPdfRelativePath = "artifacts/original-complaint.pdf" as const;

  if (await readablePdf(originalPdfPath)) {
    progress?.(
      `pdf-to-markdown: using existing original complaint PDF ${originalPdfPath}`,
    );
    return tryNativeOriginalPdf({
      artifactMarkdownPath,
      attempts,
      markdownArtifactId,
      markdownRelativePath,
      originalPdfPath,
      originalPdfRelativePath,
      source,
    });
  }

  if (!promptForOriginalPdfPath) {
    progress?.("pdf-to-markdown: no original complaint PDF prompt configured");
    return undefined;
  }

  progress?.(
    "pdf-to-markdown: native text was not usable; asking for original complaint PDF before OCR",
  );
  let invalidPath: string | undefined;
  let unusableNativeTextPath: string | undefined;
  for (;;) {
    const userPath = normalizePromptedPdfPath(
      await promptForOriginalPdfPath({
        invalidPath,
        unusableNativeTextPath,
        reason: "Native text extraction did not produce usable body text.",
        source,
      }),
    );

    if (!userPath) {
      attempts.push({
        method: "alternate-original",
        status: "skipped",
        reason: "No original complaint PDF path was provided.",
      });
      return undefined;
    }

    if (!(await readablePdf(userPath))) {
      invalidPath = userPath;
      unusableNativeTextPath = undefined;
      progress?.(
        `pdf-to-markdown: provided original complaint PDF is not readable: ${userPath}`,
      );
      continue;
    }

    progress?.(
      `pdf-to-markdown: checking original complaint PDF native text from ${userPath}`,
    );
    const originalTextUsable = await extractPdfTextArtifact({
      destinationPath: artifactMarkdownPath,
      id: markdownArtifactId,
      pdfPath: userPath,
    });

    if (!originalTextUsable) {
      invalidPath = undefined;
      unusableNativeTextPath = userPath;
      progress?.(
        `pdf-to-markdown: provided original complaint PDF native text is not usable: ${userPath}`,
      );
      continue;
    }

    progress?.(
      `pdf-to-markdown: copying original complaint PDF from ${userPath}`,
    );
    progress?.(`pdf-to-markdown: writing original PDF ${originalPdfPath}`);
    await copyFile(userPath, originalPdfPath);

    attempts.push({
      method: "alternate-original",
      status: "completed",
      reason: "Original complaint PDF native text produced usable body text.",
    });

    return {
      alternateOriginalPdfRelativePath: originalPdfRelativePath,
      extraction: completedExtraction({
        attempts,
        markdownPath: markdownRelativePath,
        method: "alternate-original",
        nativeTextUsable: false,
        source: { ...source, pdfPath: originalPdfPath },
      }),
      pdfPath: originalPdfPath,
      pdfRelativePath: originalPdfRelativePath,
    };
  }
}

function normalizePromptedPdfPath(
  value: string | undefined,
): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }

  return trimmed.replace(/^(['"])(.*)\1$/, "$2");
}

async function tryNativeOriginalPdf({
  artifactMarkdownPath,
  attempts,
  markdownArtifactId,
  markdownRelativePath,
  originalPdfPath,
  originalPdfRelativePath,
  source,
}: {
  artifactMarkdownPath: string;
  attempts: MethodAttempt[];
  markdownArtifactId: string;
  markdownRelativePath: MarkdownNodeRelativePath;
  originalPdfPath: string;
  originalPdfRelativePath: "artifacts/original-complaint.pdf";
  source: PdfToMarkdownSource;
}): Promise<{
  alternateOriginalPdfRelativePath: "artifacts/original-complaint.pdf";
  extraction?: PdfToMarkdownExtraction;
  pdfPath: string;
  pdfRelativePath: "artifacts/original-complaint.pdf";
}> {
  const originalTextUsable = await extractPdfTextArtifact({
    destinationPath: artifactMarkdownPath,
    id: markdownArtifactId,
    pdfPath: originalPdfPath,
  });
  attempts.push({
    method: "alternate-original",
    status: originalTextUsable ? "completed" : "failed",
    reason: originalTextUsable
      ? "Original complaint PDF native text produced usable body text."
      : "Original complaint PDF native text did not produce usable body text.",
  });

  return {
    alternateOriginalPdfRelativePath: originalPdfRelativePath,
    extraction: originalTextUsable
      ? completedExtraction({
          attempts,
          markdownPath: markdownRelativePath,
          method: "alternate-original",
          nativeTextUsable: false,
          source: { ...source, pdfPath: originalPdfPath },
        })
      : undefined,
    pdfPath: originalPdfPath,
    pdfRelativePath: originalPdfRelativePath,
  };
}

function completedExtraction({
  attempts,
  markdownPath,
  method,
  nativeTextUsable,
  ocrTextUsable,
  source,
  visionTextUsable,
}: {
  attempts: MethodAttempt[];
  markdownPath: MarkdownNodeRelativePath;
  method: PdfToMarkdownExtraction["method"];
  nativeTextUsable?: boolean;
  ocrTextUsable?: boolean;
  source: PdfToMarkdownSource;
  visionTextUsable?: boolean;
}): PdfToMarkdownExtraction {
  return {
    workflow: "pdf-to-markdown",
    source_record_id: source.recordId,
    source_pdf_path: source.pdfPath,
    markdown_path: markdownPath,
    method,
    status: "completed",
    method_attempts: attempts,
    source_text_available: true,
    native_text_usable: nativeTextUsable,
    ocr_text_usable: ocrTextUsable,
    vision_text_usable: visionTextUsable,
  };
}

function pausedExtraction({
  attempts,
  nativeTextUsable,
  ocrTextUsable,
  reason,
  source,
  visionTextUsable,
}: {
  attempts: MethodAttempt[];
  nativeTextUsable?: boolean;
  ocrTextUsable?: boolean;
  reason: string;
  source: PdfToMarkdownSource;
  visionTextUsable?: boolean;
}): PdfToMarkdownExtraction {
  return {
    workflow: "pdf-to-markdown",
    source_record_id: source.recordId,
    source_pdf_path: source.pdfPath,
    method: "vision",
    status: "paused",
    method_attempts: attempts,
    source_text_available: false,
    native_text_usable: nativeTextUsable,
    ocr_text_usable: ocrTextUsable,
    vision_text_usable: visionTextUsable,
    reason,
  };
}

async function runOcrAndVisionFallbacks({
  artifactMarkdownPath,
  attempts,
  env,
  markdownArtifactId,
  markdownRelativePath,
  progress,
  source,
  visionExtractor,
  workflowDirectory,
}: {
  artifactMarkdownPath: string;
  attempts: MethodAttempt[];
  env?: NodeJS.ProcessEnv;
  markdownArtifactId: string;
  markdownRelativePath: MarkdownNodeRelativePath;
  progress?: (message: string) => void;
  source: PdfToMarkdownSource;
  visionExtractor?: PdfToMarkdownVisionExtractor | null;
  workflowDirectory: string;
}): Promise<PdfToMarkdownExtraction> {
  const renderedPages = await renderPdfPages({
    pdfPath: source.pdfPath,
    progress,
    workflowDirectory,
  });

  if (!renderedPages.ok) {
    attempts.push({
      method: "ocr",
      status: "skipped",
      reason: renderedPages.reason,
    });
    attempts.push({
      method: "vision",
      status: "skipped",
      reason: renderedPages.reason,
    });
    return pausedExtraction({
      attempts,
      nativeTextUsable: false,
      reason: renderedPages.reason,
      source,
    });
  }

  const pageImagePaths = renderedPages.pageImagePaths;
  const ocrResult = await extractMarkdownWithTesseract({
    pageImagePaths,
    progress,
  });
  attempts.push(ocrResult.attempt);

  if (ocrResult.text && isUsableExtractedPdfText(ocrResult.text)) {
    await writeTextArtifact({
      destinationPath: artifactMarkdownPath,
      id: markdownArtifactId,
      metadata: { artifact: "extracted-pdf-text", method: "ocr" },
      text: ocrResult.text,
    });
    return completedExtraction({
      attempts,
      markdownPath: markdownRelativePath,
      method: "ocr",
      nativeTextUsable: false,
      ocrTextUsable: true,
      source,
    });
  }

  const selectedVisionExtractor =
    visionExtractor === undefined
      ? openAiPdfToMarkdownVisionExtractor({ env, progress })
      : visionExtractor;

  if (!selectedVisionExtractor) {
    attempts.push({
      method: "vision",
      status: "skipped",
      reason: "No vision extractor is configured.",
    });
    return pausedExtraction({
      attempts,
      nativeTextUsable: false,
      ocrTextUsable: false,
      reason:
        "Native text and OCR did not produce usable body text, and no vision extractor is configured.",
      source,
    });
  }

  progress?.("pdf-to-markdown: extracting markdown with vision");
  const visionText =
    await selectedVisionExtractor.extractMarkdownFromPageImages({
      pageImagePaths,
      progress,
    });
  const visionUsable = isUsableExtractedPdfText(visionText);
  attempts.push({
    method: "vision",
    status: visionUsable ? "completed" : "failed",
    reason: visionUsable
      ? "Vision extraction produced usable body text."
      : "Vision extraction did not produce usable body text.",
  });

  if (!visionUsable) {
    return pausedExtraction({
      attempts,
      nativeTextUsable: false,
      ocrTextUsable: false,
      reason:
        "Native text, OCR, and vision extraction did not produce usable body text.",
      source,
      visionTextUsable: false,
    });
  }

  await writeTextArtifact({
    destinationPath: artifactMarkdownPath,
    id: markdownArtifactId,
    metadata: { artifact: "extracted-pdf-text", method: "vision" },
    text: visionText,
  });
  return completedExtraction({
    attempts,
    markdownPath: markdownRelativePath,
    method: "vision",
    nativeTextUsable: false,
    ocrTextUsable: false,
    source,
    visionTextUsable: true,
  });
}

async function renderPdfPages({
  pdfPath,
  progress,
  workflowDirectory,
}: {
  pdfPath: string;
  progress?: (message: string) => void;
  workflowDirectory: string;
}): Promise<
  { ok: true; pageImagePaths: string[] } | { ok: false; reason: string }
> {
  progress?.(`pdf-to-markdown: rendering PDF pages from ${pdfPath}`);
  const outputDirectory = path.join(
    workflowDirectory,
    "artifacts",
    "pdf-to-markdown-pages",
  );
  await mkdir(outputDirectory, { recursive: true });

  let parser: PDFParse;
  try {
    parser = new PDFParse({ data: await readFile(pdfPath) });
  } catch (error) {
    return {
      ok: false,
      reason: `PDF page rendering failed: ${(error as Error).message}`,
    };
  }

  try {
    const result = await parser.getScreenshot({
      imageBuffer: true,
      imageDataUrl: false,
      scale: 2,
    });
    const paths: string[] = [];

    for (const page of result.pages) {
      const pagePath = path.join(
        outputDirectory,
        `page-${String(page.pageNumber).padStart(4, "0")}.png`,
      );
      await writeFile(pagePath, page.data);
      paths.push(pagePath);
    }

    if (paths.length === 0) {
      return {
        ok: false,
        reason: "PDF page rendering produced no page images.",
      };
    }

    return { ok: true, pageImagePaths: paths };
  } catch (error) {
    return {
      ok: false,
      reason: `PDF page rendering failed: ${(error as Error).message}`,
    };
  } finally {
    await parser.destroy();
  }
}

async function extractMarkdownWithTesseract({
  pageImagePaths,
  progress,
}: {
  pageImagePaths: readonly string[];
  progress?: (message: string) => void;
}): Promise<{ attempt: MethodAttempt; text?: string }> {
  if ((await externalToolVersion(tesseractTool)) === undefined) {
    return {
      attempt: {
        method: "ocr",
        status: "skipped",
        reason: "The local tesseract command is unavailable.",
      },
    };
  }

  progress?.("pdf-to-markdown: extracting text with tesseract OCR");
  const pages: string[] = [];
  try {
    for (const [index, pageImagePath] of pageImagePaths.entries()) {
      const { text } = await tesseractTool.run({ imagePath: pageImagePath });
      pages.push(`# Page ${String(index + 1)}\n\n${text.trim()}`);
    }
  } catch (error) {
    return {
      attempt: {
        method: "ocr",
        status: "failed",
        reason: `Tesseract OCR failed: ${(error as Error).message}`,
      },
    };
  }

  const text = pages.join("\n\n");
  const usable = isUsableExtractedPdfText(text);
  return {
    attempt: {
      method: "ocr",
      status: usable ? "completed" : "failed",
      reason: usable
        ? "Tesseract OCR produced usable body text."
        : "Tesseract OCR did not produce usable body text.",
    },
    text,
  };
}

async function imageInputContent(
  pageImagePaths: readonly string[],
): Promise<{ image_url: string; type: "input_image" }[]> {
  return Promise.all(
    pageImagePaths.map(async (pageImagePath) => ({
      image_url: `data:image/png;base64,${(await readFile(pageImagePath)).toString("base64")}`,
      type: "input_image" as const,
    })),
  );
}

function openAiPdfToMarkdownVisionExtractor({
  env,
  progress,
}: {
  env?: NodeJS.ProcessEnv;
  progress?: (message: string) => void;
}): PdfToMarkdownVisionExtractor {
  return {
    async extractMarkdownFromPageImages({ pageImagePaths }) {
      const apiKey = openAiApiKey(env);
      if (!apiKey) {
        throw new Error("OPENAI_API_KEY is not configured for vision OCR.");
      }

      const promptTemplate = await readFile(
        new URL("./prompts/vision-markdown.md", import.meta.url),
        "utf8",
      );
      const prompt = [
        promptTemplate.trim(),
        "",
        "Read these rendered PDF page images and return only clean Markdown.",
        "Preserve page boundaries with headings like `# Page 1`.",
        "Do not summarize, omit, or add facts.",
        "",
        `Page count: ${String(pageImagePaths.length)}`,
      ].join("\n");

      progress?.("pdf-to-markdown: running OpenAI vision extraction");
      progress?.(
        `pdf-to-markdown: model ${env?.CASEGRAPH_OPENAI_MODEL ?? "gpt-5.2"}`,
      );
      progress?.("pdf-to-markdown: vision prompt begin");
      progress?.(prompt);
      progress?.("pdf-to-markdown: vision prompt end");
      const output = await openAiResponsesText({
        apiKey,
        env,
        input: [
          {
            content: [
              {
                text: prompt,
                type: "input_text",
              },
              ...(await imageInputContent(pageImagePaths)),
            ],
            role: "user",
          },
        ],
      });
      progress?.("pdf-to-markdown: vision output begin");
      progress?.(output);
      progress?.("pdf-to-markdown: vision output end");
      return output;
    },
  };
}

async function readableExistingMarkdown(filePath: string): Promise<boolean> {
  try {
    return (await readFile(filePath, "utf8")).trim().length > 0;
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === "ENOENT") {
      return false;
    }

    throw error;
  }
}
