import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { importCourtListenerDocket } from "./command.js";

type MockRoute = {
  status?: number;
  body: unknown;
};

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }

  if (input instanceof URL) {
    return input.href;
  }

  return input.url;
}

function makeFetch(routes: Partial<Record<string, MockRoute>>): typeof fetch {
  return (input: RequestInfo | URL, init?: RequestInit) => {
    const url = requestUrl(input);
    const method = init?.method ?? "GET";
    const route = routes[`${method} ${url}`];

    if (!route) {
      return Promise.resolve(
        new Response(
          JSON.stringify({ detail: `Unexpected ${method} ${url}` }),
          {
            status: 500,
            headers: { "content-type": "application/json" },
          },
        ),
      );
    }

    return Promise.resolve(
      new Response(JSON.stringify(route.body), {
        status: route.status ?? 200,
        headers: { "content-type": "application/json" },
      }),
    );
  };
}

function courtListenerRoutes(): Partial<Record<string, MockRoute>> {
  const base = "https://www.courtlistener.com/api/rest/v4";

  return {
    [`GET ${base}/dockets/10000001/`]: {
      body: {
        id: 10000001,
        court_id: "txnd",
        case_name: "Example v. Example City",
        slug: "example-v-example-city",
        docket_number: "1:26-cv-00001",
        date_filed: "2026-01-10",
        unmapped_raw_field: "not current graph data",
      },
    },
    [`GET ${base}/docket-entries/?docket=10000001`]: {
      body: {
        next: null,
        results: [
          {
            id: 454253864,
            entry_number: 16,
            date_filed: "2026-02-12",
            description: "RESPONSE filed by Alex Example",
            recap_documents: [`${base}/recap-documents/200000001/`],
          },
        ],
      },
    },
    [`GET ${base}/parties/?docket=10000001&filter_nested_results=True`]: {
      body: { next: null, results: [] },
    },
    [`GET ${base}/attorneys/?docket=10000001&filter_nested_results=True`]: {
      body: { next: null, results: [] },
    },
    [`GET ${base}/recap-documents/?docket_entry__docket=10000001`]: {
      body: {
        next: null,
        results: [
          {
            id: 200000001,
            docket_entry: `${base}/docket-entries/454253864/`,
            document_number: "16",
            description: "RESPONSE filed by Alex Example",
            plain_text: "Ashcroft v. Iqbal, 556 U.S. 662",
            cites: [300001],
            filepath_local: "raw/source/path.pdf",
          },
        ],
      },
    },
    [`POST ${base}/citation-lookup/`]: {
      body: [{ citation: "556 U.S. 662" }],
    },
  };
}

function createSequentialIds(...ids: string[]): () => string {
  let index = 0;

  return () => {
    const id = ids[index];
    index += 1;

    if (!id) {
      throw new Error("No test ID available");
    }

    return id;
  };
}

describe("CourtListener docket import", () => {
  test("writes minimal mapped graph records and keeps source identifiers in sources", async () => {
    const workingDirectory = await mkdtemp(path.join(tmpdir(), "casegraph-"));

    try {
      const result = await importCourtListenerDocket(
        "10000001",
        ["--write"],
        workingDirectory,
        {
          env: { COURTLISTENER_API_TOKEN: "secret-token" },
          fetch: makeFetch(courtListenerRoutes()),
          now: () => new Date("2026-05-12T14:10:03.123Z"),
          createMutationId: () => "mutation01",
          createGraphRecordId: createSequentialIds(
            "local01",
            "local02",
            "local03",
          ),
        },
        ["cases", "import", "courtlistener", "10000001", "--write"],
      );
      const workspacePath = path.join(
        workingDirectory,
        "workspace",
        "example-v-example-city",
      );
      const docket = await readFile(
        path.join(workspacePath, "local01.yaml"),
        "utf8",
      );
      const docketEntry = await readFile(
        path.join(workspacePath, "local02.yaml"),
        "utf8",
      );
      const document = await readFile(
        path.join(workspacePath, "local03.yaml"),
        "utf8",
      );

      expect(result.exitCode).toBe(0);
      expect(docket).toContain('id: "local01"');
      expect(docket).toContain('case_name: "Example v. Example City"');
      expect(docket).toContain('source_id: "10000001"');
      expect(docket).not.toContain("unmapped_raw_field");
      expect(docket).not.toContain("courtlistener_id");
      expect(docketEntry).toContain('recap_documents:\n  - "local03"');
      expect(document).toContain('docket_entry: "local02"');
      expect(document).toContain("cites:\n  - 300001");
      expect(document).not.toContain("plain_text");
      expect(document).not.toContain("filepath_local");
    } finally {
      await rm(workingDirectory, { recursive: true, force: true });
    }
  });
});
