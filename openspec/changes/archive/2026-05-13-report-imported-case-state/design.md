## Context

CaseGraph currently creates repo-local case workspaces and can import CourtListener docket data into YAML graph records under `workspace/<case-id>/`. Imported records already preserve source references and mutation history. The next workflow step is to inspect the court docket chronology before adding evidence or creating analysis artifacts.

The existing CLI is organized under `casegraph cases`, and existing commands enforce strict argument shapes. Omitted case ID resolution is already defined for explicitly supported command forms when exactly one valid case exists.

## Goals / Non-Goals

**Goals:**

- Add `casegraph cases report <case-id>`.
- Add `casegraph cases report` only for the exactly-one-valid-case condition.
- Produce a deterministic read-only legal docket from local YAML records.
- Order docket entries chronologically by filed date, then entry number.
- Include related imported document references when visible.

**Non-Goals:**

- Do not add evidence registration.
- Do not add analysis creation or application.
- Do not add support matrix reporting.
- Do not parse PDFs or other source files.
- Do not infer facts, claims, authorities, or legal support.
- Do not create graph records, edge files, aliases, default case state, or current-case pointers.
- Do not remove or extend complaint document registration in this change.

## Decisions

### Keep Reporting Under `cases`

The command will be `casegraph cases report`, not a new top-level `reports` group. The project has one report need right now and the current command surface is case-centered.

### Use Local YAML Records Only

The report will read graph records already present in `workspace/<case-id>/`. It will not call CourtListener or inspect raw `.history` responses except as ordinary local files if implementation needs to determine import provenance.

### Make The Main Output A Legal Docket

The report will be docket-entry-first. Each docket entry is one court case event. The output will show filed date, entry number when present, description/action text, and related imported document references when current records expose them.

This is intentionally not a legal analysis timeline. The report restates imported court docket records; it does not decide what the entries mean.

### Keep Docket Rows Terminal-Safe

Docket entry rows will be capped at 80 characters. The command will truncate the docket action text column with `...` when the full text would make the row exceed 80 characters. This keeps the default report readable in ordinary terminals and leaves full source text in the underlying graph records and history files.

### Keep Missing Categories Secondary

After the docket, the report will include a short missing next-step categories section for evidence records, accepted facts, accepted claims, and support analysis. This section stays secondary to the docket and reports current graph presence only; it does not infer legal gaps.

### Keep YAML Reading Scoped

The initial reader may parse only the fields needed by this report: `type`, `kind`, `id`, `date_filed`, `entry_number`, `description`, `recap_documents`, `docket_entry`, `document_number`, `document_type`, and `sources`.

### Reject Ambiguous Command Shapes

The command will reject extra positional tokens and will only omit `<case-id>` when exactly one valid case exists.

## Risks / Trade-offs

- [Risk] The report could become a premature support matrix. -> Mitigation: limit this change to docket chronology and visible document references only.
- [Risk] YAML parsing could become a generic persistence layer. -> Mitigation: keep the reader direct and scoped to the record fields this report needs.
- [Risk] Imported records may lack dates or entry numbers. -> Mitigation: sort entries with visible dates first and print missing values as visibly unavailable, without guessing.
