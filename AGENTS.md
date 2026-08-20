# AGENTS.md

## Purpose

This file defines how software agents must work in this repository.

CaseGraph is a personal case-analysis tool. The development style is outcome-driven, test-first, simple, direct, evidence-informed, and hostile to speculative complexity.

Agents must treat this file as binding project guidance.

---

## Prime Directive

Build the smallest correct thing that produces the intended outcome.

Do not optimize for imagined future needs.
Do not preserve old behavior unless explicitly required.
Do not add fallback behavior unless explicitly required and tested.
Do not speculate.
Do not invent requirements.
Do not hide uncertainty.
Do not add architecture that the current outcome does not need.

---

## Agent Operating Contract

Before making changes:

1. Read this file.
2. Identify the primary outcome.
3. Inspect the existing project conventions.
4. Find the relevant tests, build commands, and validation commands.
5. Make the smallest safe change.
6. Prove the change works.
7. Report exactly what changed, what was validated, and what remains uncertain.

Always format and lint all files in the repository, regardless of source. Do not
exclude generated, vendored, bridge, prompt, skill, or schema files from
formatting or lint validation just because they came from another tool or
repository.

When an agent notices a defect, problem, edge case, suboptimal implementation,
poor variable name, incorrect command, stale instruction, or similar issue at
any time:

- Fix it immediately when the fix is low-risk and within the current worktree.
- Ask the user before fixing when the risk, scope, product impact, or ownership
  is unclear.
- Keep the fix small, reversible, and consistent with the current outcome.
- Include every opportunistic fix in the final report so the user can decide
  whether to keep or revert it.

When requirements are ambiguous:

- Prefer the smallest safe interpretation.
- State the assumption plainly.
- Keep the change reversible.
- Do not invent missing requirements.
- Ask only when a wrong assumption would cause meaningful harm.

When the repository disagrees with this file:

- Follow this file unless doing so would break existing explicit project requirements.
- Call out the conflict.
- Prefer a small, reversible change over a broad rewrite.

If the user asks you to stop, stop immediately. Do not continue verification, cleanup, or "one last" command.

---

## Collaboration Rule

Do not blindly follow instructions when an implementation detail appears risky, underspecified, inconsistent, likely to create a bad user experience, or when there are alternatives that may not have been considered.

Small and large gaps are best caught early.

When you notice a possible improvement, missed edge case, bad idea, hidden assumption, or tradeoff:

- Call it out before implementing if it changes behavior, validation, data shape, command UX, or long-term conventions.
- Explain the concern briefly and concretely.
- Offer a recommended default when useful.
- Ask for direction when the decision is material.
- If the decision is small and reversible, proceed only after stating the assumption.
- Do not surprise the user with stricter rules, broader scope, new abstractions, or hidden behavior changes.

This is collaborative engineering. The user wants the agent's technical judgment, but decisions that materially affect behavior or future conventions must be visible before implementation.

---

## Product Context Files

Before implementing product behavior, agents must read:

- `openspec/config.yaml` for product direction, user goals, non-goals, global OpenSpec principles, and constraints.
- `openspec/specs/*/spec.md` for current accepted behavior.
- `openspec/changes/*` for proposed behavior changes.
- Relevant accepted ADRs under `docs/adr/` to verify the implementation stays consistent with current architectural decisions and to catch conflicts early.

`openspec/config.yaml` is the product strategy and OpenSpec project constitution.
`openspec/specs/*` are current requirements.
`openspec/changes/*` are proposed changes.
ADRs provide supporting context and decision history.

Read ADRs selectively but deliberately. At minimum, review ADR titles and statuses, then read the accepted ADRs that touch the behavior, data shape, command UX, storage location, test strategy, or architecture being changed.

If project context, a capability spec, and an ADR conflict, stop and call out the conflict. Do not guess.

---

## OpenSpec Usage

OpenSpec is the source of truth for intended system behavior.

Use `AGENTS.md` to understand how to build.
Use `openspec/config.yaml` to understand global project principles.
Use `openspec/specs/*/spec.md` to understand current durable system behavior.
Use `openspec/changes/*` to propose and validate behavior changes.
Use ADRs as supporting context, not as the primary behavior contract.

Do not treat implementation code as the only specification.
Do not bury product behavior in comments, tickets, pull requests, or agent messages.
If behavior matters, it belongs in OpenSpec.

### Superpowers Bridge Routing

This repo uses `superpowers-bridge` to bridge OpenSpec artifact governance with
Superpowers execution skills. Integration rules, artifact paths, and prechecks
are defined in `openspec/schemas/superpowers-bridge/`.

When a user starts a narrative design discussion or asks to brainstorm, use
verbal `superpowers:brainstorming`, but do not write to
`docs/superpowers/specs/`. Once the conversation converges, recommend promoting
the work to an OpenSpec change so the output lands in
`openspec/changes/<change-name>/brainstorm.md`.

Do not promote automatically. Promotion requires the user's explicit
confirmation and all five conditions below:

1. Scope is locked in one sentence.
2. Major design forks are resolved.
3. Cross-system dependencies are mapped as ready, mockable, or genuinely
   unknown.
4. Acceptance criteria are concrete.
5. Recent turns are confirmations, not new alternatives.

For new capabilities, architectural changes, breaking changes, validation
changes, data-shape changes, workflow changes, or other user-visible behavior
changes, use the OpenSpec flow. For bug fixes that restore intended behavior,
test backfills, linter tweaks, non-breaking dependency updates, typos,
documentation-only updates, or config value tweaks without structural behavior
change, use a direct PR-sized change instead.

Do not let Superpowers write planning output to `docs/superpowers/plans/`.
Bridge-directed planning belongs in
`openspec/changes/<change-name>/plan.md`.

### Standard Locations

```text
openspec/
  config.yaml
  specs/
    <capability>/
      spec.md
  changes/
    <change-name>/
      proposal.md
      design.md
      tasks.md
      specs/
        <capability>/
          spec.md
```

### What Belongs Where

#### `AGENTS.md`

Defines how agents should work in this repository.

Use it for engineering doctrine:

- TDD.
- Simplicity rules.
- Naming rules.
- No silent fallback.
- No speculative abstraction.
- Dependency policy.
- OpenSpec-first workflow expectations.

Do not put product requirements here unless they are global engineering rules.

#### `openspec/config.yaml`

Defines global project context and product principles.

Use it for durable project-wide values:

- Who the system serves.
- What outcomes matter.
- What trust model the system must preserve.
- What global constraints apply.
- What quality bars apply across capabilities.

#### `openspec/specs/<capability>/spec.md`

Defines current accepted behavior for a capability.

Use it for requirements that are already true or intended to remain true.

#### `openspec/changes/<change-name>/proposal.md`

Explains why a change exists.

Use it for:

- Problem statement.
- Desired outcome.
- Non-goals.
- Tradeoffs.
- Scope.
- Risks.
- Evidence.

#### `openspec/changes/<change-name>/tasks.md`

Defines implementation work.

Use it for:

- Test tasks.
- Code tasks.
- Documentation tasks.
- Validation tasks.
- Cleanup tasks.

#### `openspec/changes/<change-name>/specs/<capability>/spec.md`

Defines proposed changes to capability behavior.

Use it for new, changed, or removed requirements.

After the change is accepted and archived, these requirements should be reflected in `openspec/specs/<capability>/spec.md`.

### Product Behavior Rule

If the user depends on behavior, that behavior belongs in OpenSpec.

Examples of behavior that belongs in OpenSpec:

- What the user can do.
- What the system accepts.
- What the system rejects.
- What happens when validation fails.
- What must be recorded.
- What must be visible in a case workspace.
- What counts as success.
- What counts as failure.
- What invariants must hold.
- What data must be preserved.
- What provenance must exist.

### Command Argument Rule

For CLI commands, unexpected extra positional tokens are always a hard error. Never ignore extra tokens and never silently use only the first token.

This is a product invariant because ignored tokens can create or mutate the wrong case workspace. Future commands must define their exact accepted argument shape in OpenSpec and reject anything outside that shape with a clear error.

### Engineering Implementation Rule

If the rule describes how agents should build rather than what the product must do, it belongs in `AGENTS.md`.

Examples:

- Prefer TDD.
- Use Conventional Commits when committing.
- Keep branches short-lived.
- Avoid deprecated APIs.
- Use descriptive names.
- Prefer immutability.
- Do not add fallback behavior without current need.
- Remove code that fails the necessary-or-remove-it test.

### No Hidden Product Decisions

Agents must not encode product decisions in implementation without making them visible in OpenSpec or asking the user.

Examples of hidden product decisions:

- stricter validation than requested
- silently normalizing user input
- adding required fields
- adding new files or durable schema conventions
- changing command semantics
- adding fallback behavior
- choosing a persistence model

### Required Agent Behavior

Before implementing a behavior change, agents must check for an OpenSpec change.

If no OpenSpec change exists and the behavior is user-visible, data-affecting, workflow-affecting, validation-affecting, or observability-affecting, the agent must create or update the appropriate OpenSpec change before implementation.

Agents must not introduce meaningful behavior that exists only in code.

A behavior change includes:

- New user-visible behavior.
- Changed user-visible behavior.
- Removed user-visible behavior.
- New or changed validation rules.
- New or changed error handling.
- New or changed data persistence.
- New or changed import or export behavior.
- New or changed observability behavior.
- New or changed irreversible decisions.

A behavior change does not include:

- Formatting-only changes.
- Test-only refactors that preserve behavior.
- Build tooling changes that do not alter runtime behavior.
- Documentation changes that do not change intended behavior.
- Internal refactors that preserve existing specified behavior.

When in doubt, treat the work as a behavior change.

### OpenSpec-First Workflow

For behavior changes:

1. Identify the outcome.
2. Identify the affected capability.
3. Check `openspec/specs/<capability>/spec.md` for existing behavior.
4. Create or update `openspec/changes/<change-name>/proposal.md`.
5. Add requirement deltas under `openspec/changes/<change-name>/specs/<capability>/spec.md`.
6. Add implementation tasks in `openspec/changes/<change-name>/tasks.md`.
7. Write failing tests from the requirement scenarios.
8. Implement the smallest change.
9. Validate tests and acceptance criteria.
10. Archive the OpenSpec change only after the behavior is accepted into the durable project state.

Do not implement first and backfill the spec later.

### Naming Changes

Use outcome-oriented change names.

Good:

```text
add-cases-new-command
create-case-workspace
record-source-provenance
reject-ambiguous-case-id
```

Avoid:

```text
update-cli
refactor-files
add-utils
phase-two
new-architecture
```

### Requirement Language

Use precise requirement language.

Prefer:

```md
The system SHALL refuse to overwrite an existing case workspace.
```

Avoid:

```md
The system should probably handle duplicate cases better.
```

Use scenarios to make requirements testable.

### Non-Goals

Every meaningful OpenSpec change should identify non-goals.

Non-goals prevent speculative work.

Example:

```md
## Non-goals

- This change does not add graph editing commands.
- This change does not add a database.
- This change does not add source connectors.
- This change does not create a generic workflow engine.
```

### Done Means Specified And Validated

A behavior change is not done unless:

- The behavior is specified in OpenSpec.
- The implementation matches the spec.
- Tests validate the scenarios.
- Non-goals were respected.
- No speculative behavior was added.
- `npm run openspec:validate` passes when OpenSpec exists.
- Relevant project tests pass.

---

## Case Workspace Policy

CaseGraph is currently for the user's personal federal case work.

Case workspaces may be checked into this repository.

The project must support more than one active case. Keep case graphs, analysis, and workspace files separated by case ID.

Do not assume there is a single default case unless a later spec explicitly adds that behavior.

Do not add encryption, sync, backup, publishing, cloud storage, or global workspace behavior unless a future OpenSpec change requires it.

---

## Infrastructure Policy

No infrastructure is needed for this project yet, and it is not foreseeable anytime soon.

Do not add:

- Terraform.
- Cloud resources.
- Deployment pipelines.
- Preview environments.
- Hosting configuration.
- IAM policies.
- Production monitoring.
- Release automation.
- Database infrastructure.
- Container orchestration.

If an infrastructure need appears later, stop and ask the user before adding it. It must be represented in OpenSpec before implementation.

---

## Dependency Policy

- Prefer the latest stable dependency versions when adding or updating project dependencies.
- Before adding a dependency, check the current published version instead of relying on memory.
- At least weekly, review project dependencies and tell the user whether anything can be updated.
- Keep dependency changes scoped to the current task unless the user asks for a broader update.
- Do not add dependencies for hypothetical future needs.
- Remove dependencies that are no longer necessary for the current outcome.

---

## Outside-In Development

Work from observable behavior back toward implementation.

Default sequence:

1. Outcome.
2. Observable behavior.
3. Acceptance test.
4. Smallest implementation.
5. Refactor after protection exists.

Do not design internal abstractions first.

Before coding, state the outcome in one sentence:

> The user came here to **\_\_**.

If a change serves multiple unrelated outcomes, split it.

---

## Test-Driven Development

Use TDD for behavior changes.

Normal loop:

1. Write a failing test that describes the desired behavior.
2. Run the test and confirm it fails for the expected reason.
3. Make the test pass with the simplest implementation.
4. Refactor only after the test is green.
5. Keep all tests green.

Tests are executable requirements.

When modifying existing behavior:

- Add or update tests first.
- Preserve behavior only when it is intentional and still required.
- Do not mix broad refactoring with behavior changes.
- Add regression tests for defects.
- Prefer focused tests that describe business behavior over tests that mirror implementation details.

Common TDD smells:

- Writing tests after implementation.
- Tests that would pass if the implementation were wrong.
- Over-mocking the behavior being tested.
- Large tests that fail for many unrelated reasons.
- Refactoring while red.
- Adding implementation code that no test requires.

---

## Simplicity Rules

Prefer the smallest complete solution.

Small does not mean sloppy.
Small means focused, understandable, testable, and shippable.

### Necessary Or Remove It

Every line of code must be necessary for the current outcome.

A line, branch, function, file, abstraction, dependency, configuration option, or test helper is justified only if removing it would make the required outcome fail.

If it can be removed and the outcome is still acceptable, the solution is too complex.

Do not keep code for hypothetical futures. "This could theoretically happen" is not a requirement.

Prefer strict validation over tolerant recovery:

- Validate preconditions before doing work.
- Validate postconditions after doing work.
- Enforce invariants at boundaries.
- Throw clear exceptions when invariants are violated.
- Reject partial, incomplete, ambiguous, or invalid input.

This is a fail-fast-and-loudly project.

Do not guess.
Do not silently recover.
Do not report partial success as success.
Do not add branches, retries, fallbacks, compatibility paths, or extension points unless the current outcome requires them.

Do not add:

- Generic frameworks.
- Abstract base classes.
- Plugin systems.
- Configuration layers.
- Shared utility packages.
- Caching.
- Queues.
- Retries.
- Fallbacks.
- Compatibility layers.
- Future extension points.

Add those only when the current outcome requires them.

---

## No Speculation

Do not invent requirements, data, constraints, users, future workflows, or architectural goals.

If something is unknown:

- State the uncertainty.
- Make the smallest safe assumption.
- Keep the implementation reversible.
- Capture the assumption in a test, issue, comment, ADR, or OpenSpec note when it matters.

Do not create code for guessed requirements.

---

## No Silent Fallback

Fallbacks hide failure and make systems harder to trust.

Do not add fallback behavior unless explicitly required by the outcome.

Bad fallback behavior:

- Swallow an exception and return empty data.
- Use default data when real data is missing.
- Skip invalid records without reporting them.
- Continue after a failed write.
- Use stale data without making that visible.
- Guess an identifier when the real identifier is missing.

Preferred behavior:

- Fail fast.
- Return a clear error.
- Preserve diagnostic context.
- Make failure visible to the user.
- Add tests for the failure mode.

Allowed fallback behavior must be:

1. Explicitly required.
2. Visible.
3. Tested.
4. Documented.
5. Removable.

---

## No Backward Compatibility By Default

Do not preserve old interfaces, schemas, routes, fields, formats, behavior, or migration paths unless explicitly required.

Backward compatibility has a cost. Do not pay it without a current reason.

Avoid:

- Legacy adapters.
- Compatibility shims.
- Old command aliases.
- Deprecated field support.
- Version negotiation.
- Migration scaffolding for hypothetical consumers.

If compatibility is required, document:

1. Who needs it.
2. Why it is required now.
3. When it can be removed.
4. How it is tested.
5. How removal will be verified.

---

## Deprecated APIs

Do not introduce deprecated APIs.

When existing code uses deprecated APIs:

- Call it out.
- Prefer the current supported API.
- Explain the migration path.
- Update the code when it is inside the current change scope.
- Do not suppress deprecation warnings unless there is a documented reason.

If a deprecated API cannot be removed in the current change, create a clear follow-up note with the current recommended replacement.

---

## Architecture Rules

### Package By Feature Or Outcome

Prefer package-by-feature over package-by-type.

Good:

```text
src/
  create-case-workspace/
    create-case-workspace.command.ts
    create-case-workspace.test.ts
```

Avoid:

```text
src/
  controllers/
  services/
  repositories/
  models/
  utils/
```

Keep related behavior together until there is evidence that separation helps.

### Domain Modeling

Use domain modeling as an inner discipline, not an upfront ceremony.

Do not start with entities.
Start with outcomes.

Use domain concepts when they clarify behavior.

Avoid:

- Entity-first design.
- Anemic domain models.
- Generic repositories.
- Service layers that add no behavior.
- Premature bounded contexts.
- Abstract factories without current need.

Prefer:

- Clear language.
- Small policies.
- Explicit commands.
- Pure decision functions.
- Behavior near the outcome it serves.

### SOLID, Without Ceremony

Use SOLID principles as design pressure, not architecture theater.

Prefer:

- Single responsibility.
- Explicit dependencies.
- Small interfaces.
- Composition over inheritance.
- Substitution-safe abstractions.
- Open for extension only when extension is currently required.
- Dependency inversion at boundaries, not everywhere.

Avoid:

- Interfaces with one implementation unless they protect a real boundary.
- Abstract classes without current need.
- Inheritance for code reuse.
- Dependency injection containers where simple construction works.
- Design patterns added for their own sake.

### Prefer Immutability

Prefer code that is easy to reason about.

Use:

- Immutable data where practical.
- Pure functions for decisions.
- Explicit inputs.
- Explicit outputs.
- `readonly` where appropriate.
- Side effects at clear boundaries.

Avoid:

- Global mutable state.
- Hidden I/O.
- Ambient context.
- Temporal coupling.
- Hidden caches.
- Hidden dependency lookup.

Separate decisions from effects when practical.

---

## TypeScript Defaults

When using TypeScript:

- Use strict typing.
- Avoid `any`.
- Prefer discriminated unions for state.
- Prefer explicit return types at public boundaries.
- Keep modules small and focused.
- Extract shared logic only after duplication proves the need.
- Prefer readable, direct code over clever type machinery.

---

## Data And Evidence Rules

CaseGraph is for case analysis. Raw inputs, source references, analysis notes, and provenance are evidence-like material.

### Preserve Raw Inputs

For imports, source review, public-records processing, filings, exhibits, and other evidence-style workflows:

- Preserve raw input first.
- Preserve the source URL, file name, request identifier, timestamp, and retrieval method when available.
- Record transformation steps when data is derived.
- Keep derived data reproducible.
- Keep rejected or incomplete data inspectable.
- Make manual corrections explicit and auditable.

Do not normalize away evidence.

### Provenance Is Required

Every derived record should be traceable to its source.

A useful provenance record includes:

- Source system.
- Source file or URL.
- Source record identifier.
- Retrieval timestamp.
- Transformation version.
- Human approval status when applicable.

If provenance is missing, fail or mark the record incomplete. Do not guess.

### Human Approval Locks Mappings

When a human approves an entity mapping, treat it as durable.

Do not silently remap approved entities.

If a mapping needs to change:

1. Record the old mapping.
2. Record the new mapping.
3. Record why it changed.
4. Preserve who or what changed it.
5. Make the change auditable.

---

## Observability

Make systems explain themselves.

For CaseGraph, observability usually means user-visible diagnostics, clear command output, traceable files, and auditable records rather than production telemetry.

Use observability to answer:

- What happened?
- What input was used?
- What changed?
- What failed?
- What was skipped?
- What should the user do next?

Prefer clear structured records when behavior affects case data.

Do not log or write sensitive case details casually. If a future feature handles sensitive data, its OpenSpec requirements must state what is recorded and why.

---

## Defect Policy

Fix defects before adding features when the defect affects the current work.

Default priority:

1. Data integrity issues.
2. Security or privacy issues.
3. Broken tests.
4. User-visible defects.
5. New features.

Do not build new features on a broken foundation.

For every defect:

1. Write a failing test or reproduction.
2. Fix the defect.
3. Prove the test fails without the fix when practical.
4. Prove the test passes with the fix.
5. Keep the test.

Do not "fix" defects that cannot be reproduced unless the risk of waiting is higher than the risk of change.

---

## Documentation

Documentation should reduce future confusion.

Useful documentation includes:

- How to run the project.
- How to test the project.
- How data flows through the system.
- Why an architectural decision was made.
- What assumptions are currently true.
- What is intentionally not supported.

Avoid documentation that repeats obvious code.

### ADRs

Use ADRs for durable architectural decisions.

An ADR should include:

1. Status.
2. Context.
3. Decision.
4. Consequences.
5. Alternatives considered when useful.
6. Evidence when available.
7. Revisit trigger when applicable.

Do not write ADRs for trivial implementation details.

---

## Git And Commit Guidance

Use Conventional Commits when committing.

Format:

```text
<type>(<scope>): <summary>
```

Examples:

```text
feat(cli): create case workspace command
fix(workspace): reject duplicate case ids
test(cli): cover cases new help output
docs(agents): document OpenSpec workflow
chore(deps): update build tooling
```

Preferred types:

- `feat` for user-visible or system-visible capability.
- `fix` for defects.
- `test` for test-only changes.
- `refactor` for behavior-preserving code changes.
- `docs` for documentation.
- `chore` for maintenance.
- `build` for build-system changes.
- `revert` for reverting prior changes.

Rules:

- Keep the summary imperative and specific.
- Use a meaningful scope.
- Do not use vague summaries like `update code`, `fix stuff`, or `cleanup`.
- Do not batch unrelated OpenSpec changes into one commit.

---

## Done Means Done

A change is done when:

- The outcome is satisfied.
- Required OpenSpec changes were created or updated.
- Current OpenSpec requirements still match the implementation.
- Meaningful behavior does not exist only in code.
- Tests cover the behavior.
- `npm run validate` passes, or any command that could not run is reported with the reason.
- The code is readable.
- No speculative functionality was added.
- No silent fallback was added.
- Deprecated APIs were avoided or called out.
- Documentation was updated when needed.
- Remaining uncertainty is stated plainly.

---

## Agent Response Format

When reporting back, use this structure when practical:

```text
Outcome:
- ...

Changed:
- ...

Validated:
- ...

Not changed:
- ...

Risks / uncertainty:
- ...

Next useful step:
- ...
```

Keep the response direct.

Do not over-explain.
Do not claim validation that was not performed.
Do not say something is ready unless it was tested enough to justify that claim.

---

## Forbidden Defaults

Do not default to:

- Infrastructure work.
- Cloud resources.
- Deployment pipelines.
- Preview environments.
- Long-lived branches.
- Speculative abstractions.
- Silent fallback.
- Backward compatibility.
- Untested behavior.
- Generic service layers.
- Interfaces for one implementation.
- Global mutable state.
- Deprecated APIs.
- Guessing missing data.
- Inventing requirements.
- Meaningful behavior that exists only in implementation code and not in OpenSpec.
- Code that fails the necessary-or-remove-it test.

---

## Preferred Defaults

Default to:

- Outcomes first.
- TDD.
- Small changes.
- OpenSpec before behavior changes.
- Explicit names.
- Immutability.
- Pure decision functions.
- Deterministic workflows.
- Provenance.
- Clear errors.
- Fast feedback.
- Latest stable dependencies.
- Direct communication.

---

## Final Reminder

The best solution is usually smaller than the first design.

Start with the outcome.
Write the test.
Make it work.
Make it clear.
Remove what is no longer needed.
