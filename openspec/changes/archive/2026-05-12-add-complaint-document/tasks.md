## 1. Test Complaint Document Command

- [x] 1.1 Add CLI acceptance test for creating `workspace/<case-id>/complaint.yaml` from `casegraph cases add document <case-id> complaint <path-to-pdf>`.
- [x] 1.2 Add acceptance test proving the command records the external PDF path only and does not copy the PDF into the workspace.
- [x] 1.3 Add acceptance tests for missing document type, missing path, extra positional tokens, and unsupported document types.
- [x] 1.4 Add acceptance tests for missing case workspace and duplicate `complaint.yaml`.
- [x] 1.5 Add assertions that the complaint YAML has the required document node fields and omits `parent` and edge storage.
- [x] 1.6 Add acceptance tests for missing, non-file, and non-PDF source paths.

## 2. Implement Complaint Document Command

- [x] 2.1 Add parser handling for `cases add document <case-id> complaint <path-to-pdf>` with hard errors for any other positional shape.
- [x] 2.2 Validate that `workspace/<case-id>` exists before writing.
- [x] 2.3 Validate that `workspace/<case-id>/complaint.yaml` does not already exist before writing.
- [x] 2.4 Write the complaint document node YAML using the existing node serialization style where practical.
- [x] 2.5 Report the created complaint document path on success and clear failure messages on rejection.
- [x] 2.6 Validate that `<path-to-pdf>` exists, is readable, is a regular file, and starts with the PDF signature before writing.

## 3. Guide Next Steps

- [x] 3.1 Add acceptance coverage that successful `cases new` output tells the user to add the complaint document.
- [x] 3.2 Add acceptance coverage that successful complaint document output tells the user to run no-argument augmentation for directly referenced items not in the graph.
- [x] 3.3 Update successful command output with the next-step guidance.

## 4. Validate

- [x] 4.1 Run the focused test suite for the new command.
- [x] 4.2 Run `npm run validate`.
- [x] 4.3 Run `npm run openspec:validate`.
