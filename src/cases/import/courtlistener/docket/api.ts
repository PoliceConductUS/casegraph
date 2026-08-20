import type { CommandResult, SourceRequestRecord } from "./types.js";
import { sourceIdValue } from "./source-values.js";

const courtListenerApiBaseUrl = "https://www.courtlistener.com/api/rest/v4";

function responseHeaders(headers: Headers): Record<string, string> {
  return Object.fromEntries(
    [...headers.entries()].filter(
      ([name]) => name.toLowerCase() !== "set-cookie",
    ),
  );
}

async function courtListenerRequest(
  requestId: string,
  url: string,
  token: string,
  fetchFunction: typeof fetch,
  method = "GET",
  body?: unknown,
): Promise<SourceRequestRecord> {
  const requestHeaders = {
    accept: "application/json",
    authorization: `Token ${token}`,
  };
  const fetchHeaders: Record<string, string> = { ...requestHeaders };
  let fetchBody: string | undefined;

  if (body !== undefined) {
    fetchHeaders["content-type"] = "application/json";
    fetchBody = JSON.stringify(body);
  }

  const response = await fetchFunction(url, {
    method,
    headers: fetchHeaders,
    body: fetchBody,
  });
  const text = await response.text();
  const contentType = response.headers.get("content-type") ?? "";
  let parsedBody: unknown = undefined;

  if (contentType.includes("json")) {
    try {
      parsedBody = JSON.parse(text);
    } catch {
      parsedBody = undefined;
    }
  }

  return {
    type: "source_request",
    id: requestId,
    request: {
      method,
      url,
      headers: {
        ...requestHeaders,
        authorization: "redacted",
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(body === undefined ? {} : { body }),
    },
    response: {
      status: response.status,
      headers: responseHeaders(response.headers),
      ...(parsedBody === undefined
        ? { body_text: text }
        : { body: parsedBody }),
    },
  };
}

function responseBodyObject(
  record: SourceRequestRecord,
): Record<string, unknown> {
  if (record.response.body && typeof record.response.body === "object") {
    return record.response.body as Record<string, unknown>;
  }

  return {};
}

function requireSuccessfulResponse(
  record: SourceRequestRecord,
): CommandResult | undefined {
  if (record.response.status >= 200 && record.response.status < 300) {
    return undefined;
  }

  return {
    exitCode: 1,
    stderr: `CourtListener request failed (${String(record.response.status)}): ${record.request.url}\n`,
  };
}

async function fetchPaginatedCourtListenerRecords(
  requestIdPrefix: string,
  url: string,
  token: string,
  fetchFunction: typeof fetch,
): Promise<{
  records: Record<string, unknown>[];
  requests: SourceRequestRecord[];
  error?: CommandResult;
}> {
  const records: Record<string, unknown>[] = [];
  const requests: SourceRequestRecord[] = [];
  let nextUrl: string | undefined = url;
  let page = 1;

  while (nextUrl) {
    const request = await courtListenerRequest(
      `${requestIdPrefix}-page-${String(page)}`,
      nextUrl,
      token,
      fetchFunction,
    );
    requests.push(request);
    const error = requireSuccessfulResponse(request);

    if (error) {
      return { records, requests, error };
    }

    const body = responseBodyObject(request);
    if (Array.isArray(body.results)) {
      records.push(
        ...body.results.filter(
          (result): result is Record<string, unknown> =>
            result !== null && typeof result === "object",
        ),
      );
    }

    nextUrl = typeof body.next === "string" ? body.next : undefined;
    page += 1;
  }

  return { records, requests };
}

export async function fetchCourtListenerDocket(
  docketId: string,
  token: string,
  fetchFunction: typeof fetch,
): Promise<{
  responses?: {
    docket: Record<string, unknown>;
    docketRequest: SourceRequestRecord;
    docketEntries: Record<string, unknown>[];
    docketEntryRequests: SourceRequestRecord[];
    parties: Record<string, unknown>[];
    partyRequests: SourceRequestRecord[];
    attorneys: Record<string, unknown>[];
    attorneyRequests: SourceRequestRecord[];
    recapDocuments: Record<string, unknown>[];
    recapDocumentRequests: SourceRequestRecord[];
    citationLookupRequests: SourceRequestRecord[];
    citationLookupIncomplete: boolean;
  };
  error?: CommandResult;
}> {
  const docketRequest = await courtListenerRequest(
    "request-docket",
    `${courtListenerApiBaseUrl}/dockets/${encodeURIComponent(docketId)}/`,
    token,
    fetchFunction,
  );
  const docketError = requireSuccessfulResponse(docketRequest);
  if (docketError) {
    return { error: docketError };
  }

  const docket = responseBodyObject(docketRequest);
  const docketEntries = await fetchPaginatedCourtListenerRecords(
    "request-docket-entries",
    `${courtListenerApiBaseUrl}/docket-entries/?docket=${encodeURIComponent(docketId)}`,
    token,
    fetchFunction,
  );
  if (docketEntries.error) {
    return { error: docketEntries.error };
  }

  const parties = await fetchPaginatedCourtListenerRecords(
    "request-parties",
    `${courtListenerApiBaseUrl}/parties/?docket=${encodeURIComponent(docketId)}&filter_nested_results=True`,
    token,
    fetchFunction,
  );
  if (parties.error) {
    return { error: parties.error };
  }

  const attorneys = await fetchPaginatedCourtListenerRecords(
    "request-attorneys",
    `${courtListenerApiBaseUrl}/attorneys/?docket=${encodeURIComponent(docketId)}&filter_nested_results=True`,
    token,
    fetchFunction,
  );
  if (attorneys.error) {
    return { error: attorneys.error };
  }

  const recapDocuments = await fetchPaginatedCourtListenerRecords(
    "request-recap-documents",
    `${courtListenerApiBaseUrl}/recap-documents/?docket_entry__docket=${encodeURIComponent(docketId)}`,
    token,
    fetchFunction,
  );
  if (recapDocuments.error) {
    return { error: recapDocuments.error };
  }

  const citationLookupRequests: SourceRequestRecord[] = [];
  let citationLookupIncomplete = false;

  for (const recapDocument of recapDocuments.records) {
    const plainText = recapDocument.plain_text;
    if (typeof plainText !== "string" || plainText.trim().length === 0) {
      continue;
    }

    const recapDocumentId = sourceIdValue(recapDocument.id);
    const lookup = await courtListenerRequest(
      `request-citation-lookup-recap-document-${recapDocumentId}`,
      `${courtListenerApiBaseUrl}/citation-lookup/`,
      token,
      fetchFunction,
      "POST",
      { text: plainText },
    );
    citationLookupRequests.push(lookup);

    if (lookup.response.status < 200 || lookup.response.status >= 300) {
      citationLookupIncomplete = true;
    }
  }

  return {
    responses: {
      docket,
      docketRequest,
      docketEntries: docketEntries.records,
      docketEntryRequests: docketEntries.requests,
      parties: parties.records,
      partyRequests: parties.requests,
      attorneys: attorneys.records,
      attorneyRequests: attorneys.requests,
      recapDocuments: recapDocuments.records,
      recapDocumentRequests: recapDocuments.requests,
      citationLookupRequests,
      citationLookupIncomplete,
    },
  };
}
