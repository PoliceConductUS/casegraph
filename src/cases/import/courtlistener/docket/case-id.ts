const validCaseIdPattern = /^[A-Za-z0-9_-]+$/;
const windowsReservedDeviceNames = new Set([
  "CON",
  "PRN",
  "AUX",
  "NUL",
  "COM1",
  "COM2",
  "COM3",
  "COM4",
  "COM5",
  "COM6",
  "COM7",
  "COM8",
  "COM9",
  "LPT1",
  "LPT2",
  "LPT3",
  "LPT4",
  "LPT5",
  "LPT6",
  "LPT7",
  "LPT8",
  "LPT9",
]);

function suggestCaseId(caseId: string): string | undefined {
  const suggestion = caseId
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (suggestion.length === 0) {
    return undefined;
  }

  if (windowsReservedDeviceNames.has(suggestion.toUpperCase())) {
    return `${suggestion}-case`;
  }

  return suggestion;
}

function isValidCaseId(caseId: string): boolean {
  return (
    validCaseIdPattern.test(caseId) &&
    caseId !== "." &&
    caseId !== ".." &&
    !windowsReservedDeviceNames.has(caseId.toUpperCase())
  );
}

export function deriveCaseIdFromDocket(
  docket: Record<string, unknown>,
): string | undefined {
  const slug = docket.slug;
  if (typeof slug === "string" && isValidCaseId(slug)) {
    return slug;
  }

  for (const field of ["case_name", "case_name_full", "case_name_short"]) {
    const value = docket[field];
    if (typeof value !== "string") {
      continue;
    }

    const suggestion = suggestCaseId(value);
    if (suggestion && isValidCaseId(suggestion)) {
      return suggestion;
    }
  }

  return undefined;
}
