# Verification

## Commands

- `npm run validate` passed on 2026-05-12.
- `npm run validate` passed again after fixing source-prefixed imported graph IDs.
- `npm test` passed after removing source record IDs from generated graph IDs and top-level graph properties.
- `npm run validate` passed after extracting CourtListener import into `src/import/courtlistener/docket.ts` and adding `docket.mapping.yaml`.

## Coverage

- Formatting completed with Prettier.
- ESLint and format check passed.
- Vitest passed: 2 test files, 39 tests.
- TypeScript typecheck passed.
- Build passed.
- Strict OpenSpec validation passed for `change/add-courtlistener-docket-import`, `spec/case-documents`, and `spec/case-workspaces`.

## Notes

- Validation used mocked CourtListener responses in tests; no live CourtListener request was made during validation.
- Imported graph record IDs are now opaque local IDs; CourtListener source model and source record ID are preserved in `sources[]`.
- Current graph records are intentionally minimal and copy only mapped properties plus explicit local relationship references.
