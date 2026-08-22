import { mkdir, mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test, vi } from "vitest";
import { readCaseHome } from "../../../workspaces/case-home-document.js";
import { readCaseLocator } from "../../../workspaces/case-locator-document.js";
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
  test("dry-run and explicit dry-run need no home and create no case files", async () => {
    const workingDirectory = await mkdtemp(path.join(tmpdir(), "casegraph-"));
    const fetch = makeFetch(courtListenerRoutes());

    try {
      for (const flags of [[], ["--dry-run"]]) {
        const result = await importCourtListenerDocket(
          "10000001",
          flags,
          workingDirectory,
          { env: { COURTLISTENER_API_TOKEN: "secret-token" }, fetch },
          ["cases", "import", "courtlistener", "10000001", ...flags],
        );

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain("Dry run only");
      }

      await expect(
        stat(path.join(workingDirectory, "workspace")),
      ).rejects.toThrow();
      await expect(
        stat(path.join(workingDirectory, ".casegraph")),
      ).rejects.toThrow();
    } finally {
      await rm(workingDirectory, { recursive: true, force: true });
    }
  });

  test("write import requires a home before fetching or creating files", async () => {
    const workingDirectory = await mkdtemp(path.join(tmpdir(), "casegraph-"));
    const fetch = vi.fn(makeFetch(courtListenerRoutes()));

    try {
      const result = await importCourtListenerDocket(
        "10000001",
        ["--write"],
        workingDirectory,
        { env: { COURTLISTENER_API_TOKEN: "secret-token" }, fetch },
        ["cases", "import", "courtlistener", "10000001", "--write"],
      );

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain("--home <directory> is required");
      expect(fetch).not.toHaveBeenCalled();
      expect(await readdir(workingDirectory)).toEqual([]);
    } finally {
      await rm(workingDirectory, { recursive: true, force: true });
    }
  });

  test("write import creates typed roots and records under the approved selected home", async () => {
    const workingDirectory = await mkdtemp(path.join(tmpdir(), "casegraph-"));
    const homeDirectory = path.join(workingDirectory, "selected-home");
    const casegraphHome = path.join(workingDirectory, ".casegraph");
    const approveCreation = vi.fn(() => Promise.resolve(true));

    try {
      const result = await importCourtListenerDocket(
        "10000001",
        ["--write", "--home", homeDirectory],
        workingDirectory,
        {
          env: { COURTLISTENER_API_TOKEN: "secret-token" },
          fetch: makeFetch(courtListenerRoutes()),
          casegraphHome,
          approveCreation,
          now: () => new Date("2026-05-12T14:10:03.123Z"),
          createMutationId: () => "mutation01",
          createGraphRecordId: createSequentialIds(
            "local01",
            "local02",
            "local03",
          ),
        },
        [
          "cases",
          "import",
          "courtlistener",
          "10000001",
          "--write",
          "--home",
          homeDirectory,
        ],
      );
      const locatorRoot = path.join(
        casegraphHome,
        "example-v-example-city",
        "root.yaml",
      );
      const docket = await readFile(
        path.join(homeDirectory, "local01.yaml"),
        "utf8",
      );
      const docketEntry = await readFile(
        path.join(homeDirectory, "local02.yaml"),
        "utf8",
      );
      const document = await readFile(
        path.join(homeDirectory, "local03.yaml"),
        "utf8",
      );

      expect(result.exitCode).toBe(0);
      expect(approveCreation).toHaveBeenCalledTimes(2);
      expect(result.stdout).toContain(`Case home: ${homeDirectory}`);
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
      await expect(
        readCaseHome(path.join(homeDirectory, "root.yaml")),
      ).resolves.toMatchObject({
        metadata: { name: "example-v-example-city" },
        spec: {
          graphRoot: {
            type: "node",
            kind: "case",
            id: "root",
            sources: [
              {
                mutation: "m_mutation01",
                request: "request-docket",
                path: "$.response.body",
                source_system: "courtlistener",
                source_model: "docket",
                source_id: "10000001",
              },
            ],
          },
        },
      });
      await expect(readCaseLocator(locatorRoot)).resolves.toMatchObject({
        metadata: { name: "example-v-example-city" },
        spec: { home: path.join(homeDirectory, "root.yaml") },
      });
      await expect(
        stat(
          path.join(homeDirectory, ".history", "m_mutation01", "manifest.yaml"),
        ),
      ).resolves.toBeDefined();
      await expect(
        stat(path.join(workingDirectory, "workspace")),
      ).rejects.toThrow();
    } finally {
      await rm(workingDirectory, { recursive: true, force: true });
    }
  });

  test("--yes approves only selected-home creation prompts", async () => {
    const workingDirectory = await mkdtemp(path.join(tmpdir(), "casegraph-"));
    const homeDirectory = path.join(workingDirectory, "selected-home");
    const approveCreation = vi.fn(() => Promise.resolve(false));

    try {
      const result = await importCourtListenerDocket(
        "10000001",
        ["--write", "--home", homeDirectory, "--yes"],
        workingDirectory,
        {
          env: { COURTLISTENER_API_TOKEN: "secret-token" },
          fetch: makeFetch(courtListenerRoutes()),
          casegraphHome: path.join(workingDirectory, ".casegraph"),
          approveCreation,
          createMutationId: () => "mutation01",
          createGraphRecordId: createSequentialIds(
            "local01",
            "local02",
            "local03",
          ),
        },
        [
          "cases",
          "import",
          "courtlistener",
          "10000001",
          "--write",
          "--home",
          homeDirectory,
          "--yes",
        ],
      );

      expect(result.exitCode).toBe(0);
      expect(approveCreation).not.toHaveBeenCalled();
      await expect(
        readCaseHome(path.join(homeDirectory, "root.yaml")),
      ).resolves.toBeDefined();
    } finally {
      await rm(workingDirectory, { recursive: true, force: true });
    }
  });

  test("failed import reports and retains the partially written selected home without a locator", async () => {
    const workingDirectory = await mkdtemp(path.join(tmpdir(), "casegraph-"));
    const homeDirectory = path.join(workingDirectory, "selected-home");
    const casegraphHome = path.join(workingDirectory, ".casegraph");

    try {
      const result = await importCourtListenerDocket(
        "10000001",
        ["--write", "--home", homeDirectory, "--yes"],
        workingDirectory,
        {
          env: { COURTLISTENER_API_TOKEN: "secret-token" },
          fetch: makeFetch(courtListenerRoutes()),
          casegraphHome,
          createMutationId: () => "mutation01",
          createGraphRecordId: () => {
            throw new Error("test graph write failure");
          },
        },
        [
          "cases",
          "import",
          "courtlistener",
          "10000001",
          "--write",
          "--home",
          homeDirectory,
          "--yes",
        ],
      );

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain("test graph write failure");
      expect(result.stderr).toContain(homeDirectory);
      await expect(stat(homeDirectory)).resolves.toBeDefined();
      await expect(
        stat(
          path.join(homeDirectory, ".history", "m_mutation01", "manifest.yaml"),
        ),
      ).resolves.toBeDefined();
      await expect(
        stat(path.join(homeDirectory, "root.yaml")),
      ).rejects.toThrow();
      await expect(
        stat(path.join(casegraphHome, "example-v-example-city", "root.yaml")),
      ).rejects.toThrow();
    } finally {
      await rm(workingDirectory, { recursive: true, force: true });
    }
  });

  test("declined import home creation creates no home or locator", async () => {
    const workingDirectory = await mkdtemp(path.join(tmpdir(), "casegraph-"));
    const homeDirectory = path.join(workingDirectory, "selected-home");
    const casegraphHome = path.join(workingDirectory, ".casegraph");

    try {
      const result = await importCourtListenerDocket(
        "10000001",
        ["--write", "--home", homeDirectory],
        workingDirectory,
        {
          env: { COURTLISTENER_API_TOKEN: "secret-token" },
          fetch: makeFetch(courtListenerRoutes()),
          casegraphHome,
          approveCreation: () => Promise.resolve(false),
        },
        [
          "cases",
          "import",
          "courtlistener",
          "10000001",
          "--write",
          "--home",
          homeDirectory,
        ],
      );

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain(
        "Declined creation of case home directory",
      );
      await expect(stat(homeDirectory)).rejects.toThrow();
      await expect(stat(casegraphHome)).rejects.toThrow();
    } finally {
      await rm(workingDirectory, { recursive: true, force: true });
    }
  });

  test("existing import locator collision leaves selected home unchanged", async () => {
    const workingDirectory = await mkdtemp(path.join(tmpdir(), "casegraph-"));
    const homeDirectory = path.join(workingDirectory, "selected-home");
    const casegraphHome = path.join(workingDirectory, ".casegraph");
    const locatorDirectory = path.join(casegraphHome, "EXAMPLE-V-EXAMPLE-CITY");
    const approveCreation = vi.fn(() => Promise.resolve(true));
    await mkdir(homeDirectory, { recursive: true });
    await mkdir(locatorDirectory, { recursive: true });

    try {
      const result = await importCourtListenerDocket(
        "10000001",
        ["--write", "--home", homeDirectory],
        workingDirectory,
        {
          env: { COURTLISTENER_API_TOKEN: "secret-token" },
          fetch: makeFetch(courtListenerRoutes()),
          casegraphHome,
          approveCreation,
        },
        [
          "cases",
          "import",
          "courtlistener",
          "10000001",
          "--write",
          "--home",
          homeDirectory,
        ],
      );

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain("Case locator already exists");
      expect(approveCreation).not.toHaveBeenCalled();
      expect(await readdir(homeDirectory)).toEqual([]);
    } finally {
      await rm(workingDirectory, { recursive: true, force: true });
    }
  });
});
