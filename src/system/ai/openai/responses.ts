import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type OpenAiResponsesJsonInput = {
  apiKey: string;
  cache?: {
    directory: string;
    domain: readonly string[];
    taskId: string;
    progress?: (message: string) => void;
  };
  env?: NodeJS.ProcessEnv;
  fetch?: typeof fetch;
  input?: unknown;
  jsonSchema: Record<string, unknown>;
  model?: string;
  prompt: string;
  schemaName: string;
  timeoutMs?: number;
};

export type OpenAiResponsesTextInput = {
  apiKey: string;
  env?: NodeJS.ProcessEnv;
  fetch?: typeof fetch;
  input: unknown;
  model?: string;
  timeoutMs?: number;
};

export type OpenAiResponsesOutput = {
  error?: {
    message?: string;
  };
  output?: {
    content?: {
      text?: string;
      type?: string;
    }[];
  }[];
  output_text?: string;
};

export type OpenAiResponsesJsonResult = {
  parsed: unknown;
  response: OpenAiResponsesOutput;
};

export function openAiApiKey(
  env: NodeJS.ProcessEnv | undefined,
): string | undefined {
  return env?.OPENAI_API_KEY?.trim() || undefined;
}

export function openAiApiConfigured(
  env: NodeJS.ProcessEnv | undefined,
): boolean {
  return openAiApiKey(env) !== undefined;
}

function openAiTimeoutMs(
  env: NodeJS.ProcessEnv | undefined,
  explicitTimeoutMs: number | undefined,
): number {
  if (explicitTimeoutMs !== undefined) {
    return explicitTimeoutMs;
  }

  const rawTimeout = env?.CASEGRAPH_OPENAI_TIMEOUT_MS;
  if (rawTimeout && /^\d+$/.test(rawTimeout)) {
    return Number(rawTimeout);
  }

  return 10 * 60 * 1000;
}

function openAiModel(
  env: NodeJS.ProcessEnv | undefined,
  explicitModel: string | undefined,
): string {
  return explicitModel ?? env?.CASEGRAPH_OPENAI_MODEL ?? "gpt-5.2";
}

function jsonResponseCacheKey({
  input,
  jsonSchema,
  model,
  schemaName,
}: {
  input: unknown;
  jsonSchema: Record<string, unknown>;
  model: string;
  schemaName: string;
}): string {
  return createHash("sha256")
    .update(JSON.stringify({ input, jsonSchema, model, schemaName }))
    .digest("hex");
}

function jsonResponseCachePath(input: OpenAiResponsesJsonInput): string {
  const model = openAiModel(input.env, input.model);
  const responseInput = input.input ?? input.prompt;
  const cacheKey = jsonResponseCacheKey({
    input: responseInput,
    jsonSchema: input.jsonSchema,
    model,
    schemaName: input.schemaName,
  });

  return path.join(
    input.cache?.directory ?? "",
    ...(input.cache?.domain ?? []),
    input.cache?.taskId ?? "",
    `${cacheKey}.json`,
  );
}

function responseText(output: OpenAiResponsesOutput): string | undefined {
  if (output.output_text) {
    return output.output_text;
  }

  return output.output
    ?.flatMap((item) => item.content ?? [])
    .find((content) => content.type === "output_text" && content.text)?.text;
}

function sanitizedOpenAiErrorMessage(message: string): string {
  return message.replace(/sk-[A-Za-z0-9_*.-]+/g, "[redacted-openai-api-key]");
}

function openAiResponseErrorMessage(
  body: OpenAiResponsesOutput,
  status: number,
): string {
  return sanitizedOpenAiErrorMessage(
    body.error?.message ??
      `OpenAI Responses API returned HTTP ${String(status)}`,
  );
}

export async function openAiResponsesText(
  input: OpenAiResponsesTextInput,
): Promise<string> {
  const timeoutMs = openAiTimeoutMs(input.env, input.timeoutMs);
  const abortController = new AbortController();
  const timeout = setTimeout(() => {
    abortController.abort();
  }, timeoutMs);

  try {
    const response = await (input.fetch ?? fetch)(
      "https://api.openai.com/v1/responses",
      {
        body: JSON.stringify({
          input: input.input,
          model: openAiModel(input.env, input.model),
        }),
        headers: {
          authorization: `Bearer ${input.apiKey}`,
          "content-type": "application/json",
        },
        method: "POST",
        signal: abortController.signal,
      },
    );
    const body = (await response.json()) as OpenAiResponsesOutput;

    if (!response.ok) {
      throw new Error(openAiResponseErrorMessage(body, response.status));
    }

    const text = responseText(body);
    if (!text) {
      throw new Error("OpenAI Responses API returned no output text.");
    }

    return text;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(
        `OpenAI Responses API timed out after ${String(timeoutMs)}ms`,
      );
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function openAiResponsesJson(
  input: OpenAiResponsesJsonInput,
): Promise<unknown> {
  return (await openAiResponsesJsonWithResponse(input)).parsed;
}

export async function openAiResponsesJsonWithResponse(
  input: OpenAiResponsesJsonInput,
): Promise<OpenAiResponsesJsonResult> {
  if (input.cache) {
    const cachePath = jsonResponseCachePath(input);
    try {
      const body = JSON.parse(
        await readFile(cachePath, "utf8"),
      ) as OpenAiResponsesOutput;
      const text = responseText(body);
      if (!text) {
        throw new Error(
          `Cached OpenAI response has no output text: ${cachePath}`,
        );
      }
      input.cache.progress?.(`OpenAI cache hit: ${cachePath}`);

      return {
        parsed: JSON.parse(text) as unknown,
        response: body,
      };
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code !== "ENOENT") {
        throw error;
      }
      input.cache.progress?.(`OpenAI cache miss: ${cachePath}`);
    }
  }

  const timeoutMs = openAiTimeoutMs(input.env, input.timeoutMs);
  const abortController = new AbortController();
  const timeout = setTimeout(() => {
    abortController.abort();
  }, timeoutMs);

  try {
    const response = await (input.fetch ?? fetch)(
      "https://api.openai.com/v1/responses",
      {
        body: JSON.stringify({
          input: input.input ?? input.prompt,
          model: openAiModel(input.env, input.model),
          text: {
            format: {
              name: input.schemaName,
              schema: input.jsonSchema,
              strict: false,
              type: "json_schema",
            },
          },
        }),
        headers: {
          authorization: `Bearer ${input.apiKey}`,
          "content-type": "application/json",
        },
        method: "POST",
        signal: abortController.signal,
      },
    );
    const body = (await response.json()) as OpenAiResponsesOutput;

    if (!response.ok) {
      throw new Error(openAiResponseErrorMessage(body, response.status));
    }

    const text = responseText(body);
    if (!text) {
      throw new Error("OpenAI Responses API returned no output text.");
    }

    if (input.cache) {
      const cachePath = jsonResponseCachePath(input);
      await mkdir(path.dirname(cachePath), { recursive: true });
      await writeFile(cachePath, `${JSON.stringify(body, null, 2)}\n`, {
        flag: "wx",
      });
      input.cache.progress?.(`OpenAI response cached: ${cachePath}`);
    }

    return {
      parsed: JSON.parse(text) as unknown,
      response: body,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(
        `OpenAI Responses API timed out after ${String(timeoutMs)}ms`,
      );
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
