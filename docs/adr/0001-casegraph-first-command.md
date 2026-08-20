# ADR 0001: First CaseGraph Command

## Status

Accepted.

## Context

CaseGraph is starting as a command-line tool for one immediate need: creating a local case workspace that can later hold an auditable investigation graph for Example v. Example City, No. 1:26-cv-00001 (N.D. Tex.).

The user is pro se. The command language should be plain, discoverable, and not require legal vocabulary.

The project should not add speculative commands or infrastructure. At this point, the only known user operation is creating a new case workspace.

This is a private personal repository. Case workspaces may contain sensitive legal materials and may be committed to the private repository when that is useful.

## Decision

The first implemented command will be:

```bash
casegraph cases new <case-id>
```

Example:

```bash
casegraph cases new example-v-example-city
```

The command will create a new case workspace under the repo-local workspace root:

```text
./workspace/<case-id>
```

Example:

```text
./workspace/example-v-example-city
```

The default workspace root is intentionally repo-local for now. It is visible, easy to inspect, easy to delete during development, and avoids global state before global state is needed.

The repository will not ignore `workspace/` by default. The current expectation is that this private repository may include the case workspace.

The CLI must provide useful help for:

```bash
casegraph --help
casegraph cases --help
casegraph cases new --help
```

Help text should explain:

- what the command does
- when to use it
- what it creates
- where the workspace is created
- that workspace contents may be sensitive
- that the repository is expected to be private if workspace contents are committed

The command must not overwrite an existing case workspace.

## Non-Decisions

This ADR does not create or require:

- a default/current case
- status commands
- check commands
- report commands
- graph editing commands
- source connectors
- CourtListener, PACER, TPIA, FOIA, or local-court integrations
- Supabase
- a database schema
- a global `$HOME` workspace
- sync, backup, encryption, or publishing behavior

Those decisions should be made only when a concrete workflow requires them.

## Consequences

The first implementation can stay small.

The user can create a case workspace without learning legal or database terminology.

Sensitive case material has a default local location inside the private repository.

Future commands must be justified by current case workflow, not by an imagined complete product.
