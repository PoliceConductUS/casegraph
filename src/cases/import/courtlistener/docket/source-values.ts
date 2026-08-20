export function sourceIdValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return "unknown";
}

function courtListenerIdFromApiUrl(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const match = value.match(/\/([^/]+)\/?$/);
  return match?.[1];
}

export function localIdForSourceUrl(
  sourceUrl: unknown,
  sourceRecords: readonly Record<string, unknown>[],
  localIds: readonly string[],
): string | undefined {
  const sourceId = courtListenerIdFromApiUrl(sourceUrl);
  if (!sourceId) {
    return undefined;
  }

  const index = sourceRecords.findIndex(
    (record) => sourceIdValue(record.id) === sourceId,
  );
  return index >= 0 ? localIds[index] : undefined;
}

export function localIdsForSourceUrls(
  sourceUrls: unknown,
  sourceRecords: readonly Record<string, unknown>[],
  localIds: readonly string[],
): string[] | undefined {
  if (!Array.isArray(sourceUrls)) {
    return undefined;
  }

  return sourceUrls.flatMap((sourceUrl) => {
    const localId = localIdForSourceUrl(sourceUrl, sourceRecords, localIds);
    return localId ? [localId] : [];
  });
}
