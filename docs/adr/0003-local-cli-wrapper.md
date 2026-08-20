# ADR 0003: Local CLI Wrapper

## Status

Accepted.

## Context

CaseGraph starts as a command-line tool.

The user should be able to run CaseGraph from the project folder without remembering a long Node command or building first.

The local development command is the `casegraph` executable wrapper in the repository root:

```bash
./casegraph cases new <case-id>
```

The wrapper delegates to the TypeScript CLI entrypoint while preserving normal command-line behavior. It exists so local manual use and CLI acceptance tests can exercise the same command path.

Tests can either call imported functions directly or execute the CLI through a spawned process. Direct function tests are useful for focused policies and transformations. Spawned CLI tests are better for user-visible command behavior because they exercise argument passing, current working directory behavior, stdout, stderr, and exit codes.

The project should make sure the command tested by automation matches the command the user runs during local development, but testing is not the only reason for the wrapper. The primary reason is a simple local user experience.

## Decision

The repository will keep a root-level `casegraph` executable wrapper for local development.

Users can and should use the wrapper when working from the project folder:

```bash
./casegraph <args>
```

Case commands will use this default shape:

```bash
./casegraph cases <command> <case-id> ...
```

For commands that create a case workspace, the case ID remains the created value:

```bash
./casegraph cases new <case-id>
```

For commands that operate on an existing case workspace, the command comes before the case ID:

```bash
./casegraph cases discover <case-id> <document-path>
```

This keeps command names and case IDs in separate parser positions, avoids collisions between case IDs and future command names, and gives each subcommand an explicit argument shape.

CLI acceptance tests will execute the root `./casegraph` wrapper.

The wrapper must preserve:

- command-line arguments
- stdin, stdout, and stderr behavior
- current working directory behavior
- process exit code

CLI commands must treat unexpected extra positional tokens as a hard error. The wrapper and command parser must never silently drop extra tokens or proceed with only the first positional token. This keeps the command the user typed aligned with the workspace or case data the command mutates.

If a future spec adds a default or current case, commands may define an explicit alternate shape that omits `<case-id>`. That future behavior must be specified and tested command by command. Until then, commands that operate on an existing case workspace must require `<case-id>`.

Acceptance tests should cover user-visible command behavior.

Lower-level unit tests should do the simplest thing possible. That usually means importing the file or function under test directly and using mocks, stubs, or fakes only when they make the test clearer or isolate a meaningful boundary.

For example, future unit tests may directly test case ID validation, root node serialization, or graph update policies without spawning the CLI.

Alternatives considered:

- Use `npm run casegraph -- <args>` for local development and tests. This works, but it is more verbose than the intended CLI shape and does not match how the user wants to exercise the tool.
- Use `node --experimental-transform-types src/cli.ts <args>` directly. This avoids a wrapper but exposes implementation details and is easy to mistype.
- Require `npm run build` and test `dist/cli.js`. This validates the built artifact but slows local iteration and does not support no-build test driving.
- Use `npm link` to install a global `casegraph` command. This adds machine-level state and is unnecessary for the current project.
- Use `./casegraph cases <case-id> <command> ...` for existing case commands. This reads naturally when operating on one case, but it creates ambiguity between case IDs and command names and can make future command additions collide with existing workspace IDs.

## Non-Decisions

This ADR does not require every test to spawn a process.

This ADR does not forbid mocks, stubs, or fakes in lower-level tests.

This ADR does not define a complete test taxonomy.

This ADR does not require `npm link` or any global executable setup.

This ADR does not remove the package `bin` entry for built-package usage.

This ADR does not create a default/current case.

## Consequences

Users have a short local command that matches the intended tool name.

Acceptance tests match the local manual workflow more closely.

The test suite catches wrapper, path resolution, stdio, current-working-directory, and exit-code problems.

The CLI must reject unexpected positional tokens explicitly, which adds a small amount of parser validation but prevents accidental partial commands from creating or mutating the wrong workspace.

Some acceptance tests are slower and broader than direct function tests.

Future default-case behavior can be added without changing the command-first convention by defining explicit command-specific optional forms. That should happen only after a concrete workflow requires a current-case concept.

As CaseGraph grows, important internal policies should move into importable functions and receive focused unit tests alongside CLI acceptance tests.
