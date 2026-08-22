# CaseGraph

CaseGraph is an investigation-first case graph for my federal civil-rights case:

```text
Example v. Example City, No. 1:26-cv-00001 (N.D. Tex.)
```

It is a personal tool for my own use as a pro se litigant. It is not a PoliceConduct.org project and is not intended to be supported by PoliceConduct.org.

The repository is expected to be private. It may contain case workspaces and sensitive legal materials.

CaseGraph exists because I need to track evidence, ideas, hypotheses, gaps, sources, public-records requests, authorities, opponent positions, and drafting inputs without losing the relationships between them.

The goal is not to draft filings directly. The goal is to create an auditable current state of case analysis that can later support drafting.

## Current Status

Create or attach an external case home by specifying its directory:

```bash
./casegraph cases new <case-id> --home <directory> [--yes]
```

Example:

```bash
./casegraph cases new example-v-example-city \
  --home ../cases/example-v-example-city
```

The command creates a typed `CaseHome` at the selected directory and a
machine-local `CaseLocator` under `~/.casegraph/`:

```text
../cases/example-v-example-city/
  root.yaml

~/.casegraph/example-v-example-city/
  root.yaml
```

The `CaseHome` contains the case graph root. Its node ID is `root`, scoped by
the selected case home.

Add one or more ordered external package search roots to an existing case:

```bash
./casegraph packages add example-v-example-city \
  ../authorities ../shared-records
```

The paths are stored in the selected case home's `root.yaml`. External package
roots remain read-only to CaseGraph even when the filesystem permits writes.
Managed-write authorization for shared packages is not yet supported.

## Case Home Location

Case homes may be located outside this repository. CaseGraph records the
selected home in a machine-local locator:

```text
~/.casegraph/<case-id>/root.yaml
```

The repository remains private and may include case workspaces when that is
useful. Case materials should still be treated as sensitive wherever they are
stored.

## Developer Setup

Install the full local environment:

```bash
npm run install:env
```

This runs the runtime setup, installs npm dependencies, then installs or
verifies external workflow tools.

If you want to run the setup steps separately, install runtime tools first:

```bash
npm run install:runtime
```

This uses [Brewfile](Brewfile) to install runtime bootstrap tools, then uses
[.nvmrc](.nvmrc) to install and select the project Node.js version.

Install npm dependencies:

```bash
npm install
```

Then install or verify external tools declared under `src/system/external/`:

```bash
npm run install:external
```

Current external workflow tools include:

- `tesseract` for local OCR in analysis tasks

AI extraction uses the OpenAI Responses API directly. Set `OPENAI_API_KEY` in
the shell running CaseGraph. Optional environment variables:

- `CASEGRAPH_OPENAI_MODEL` to override the model
- `CASEGRAPH_OPENAI_TIMEOUT_MS` to override the request timeout

For interactive shell use, configure `nvm` if it is not already loaded.
Homebrew prints the current shell setup instructions after installing `nvm`; on
Apple Silicon Macs the initialization usually looks like:

```bash
export NVM_DIR="$HOME/.nvm"
[ -s "/opt/homebrew/opt/nvm/nvm.sh" ] && . "/opt/homebrew/opt/nvm/nvm.sh"
```

Install and use the project Node.js version:

```bash
nvm install
nvm use
```

The Node.js runtime requirement is recorded in [.nvmrc](.nvmrc) and
`package.json` `engines.node`.

Verify external tools used by analysis workflows:

```bash
tesseract --version
```

Run the local CLI without building:

```bash
./casegraph --help
./casegraph cases new example-v-example-city \
  --home ../cases/example-v-example-city
```

The root `./casegraph` wrapper is the preferred local development command. It runs the TypeScript entrypoint directly and preserves normal CLI behavior.

Build the package entrypoint:

```bash
npm run build
```

After building, the package `bin` points to:

```text
dist/cli.js
```

## Testing And Validation

Run all automated checks:

```bash
npm run validate
```

This runs formatting, linting, tests, type checking, build, and OpenSpec validation.

Individual commands:

```bash
npm run format
npm run lint
npm test
npm run typecheck
npm run build
npm run openspec:validate
```

Use `npm run format` before committing changes. It formats supported files across the repo, including future `workspace/` YAML files.

## Making Changes

Read [AGENTS.md](AGENTS.md) before making changes.

For behavior changes, use OpenSpec first:

1. Identify the active or new OpenSpec change under `openspec/changes/`.
2. Update the proposal, design, tasks, and requirement deltas before implementation.
3. Write failing tests from the requirement scenarios.
4. Implement the smallest change.
5. Run `npm run validate`.

Do not add infrastructure, database behavior, source connectors, drafting integration, or new command surfaces unless a concrete OpenSpec change requires them.

## Design Docs

- [Initial Design](docs/concept/casegraph-initial-design.md)
- [Graph Model](docs/concept/graph-model.md)
- [Source Discovery](docs/concept/source-discovery.md)
- [ADR 0001: First CaseGraph Command](docs/adr/0001-casegraph-first-command.md)
- [ADR 0002: Filesystem-Scoped Graph Node Identity](docs/adr/0002-filesystem-scoped-graph-node-identity.md)
- [ADR 0003: Local CLI Wrapper](docs/adr/0003-local-cli-wrapper.md)

## Current Design Rules

- Start with the smallest useful behavior.
- Do not add commands before a real workflow requires them.
- Keep user-facing language pro-se friendly.
- Treat hypotheses as hypotheses, not facts.
- Treat missing and unknown information as graph items when they affect analysis.
- Keep laws and jurisdictions in the graph.
- Separate authorities from case-specific authority posture.
- Drive citation auditing from case-specific authority posture.
- Tie data gaps to records requests and responses.
- Treat opponent filings as source material and adversary intelligence.

## Not Implemented Yet

CaseGraph does not yet have:

- a database
- Supabase integration
- source connectors
- graph validation
- citation auditing
- report generation
- drafting integration

These should be added only when current case work requires them.
