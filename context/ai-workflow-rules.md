# AI Workflow Rules

## Overall Approach

1.  **Spec-Driven Development**: Always use the context files (`project-overview.md`, `architecture.md`, `code-standards.md`, `ui-context.md`) as the absolute source of truth.
2.  **Incremental Implementation**: Build the project in small, verifiable units. Do not attempt to implement entire features in a single step if they cross multiple system boundaries.
3.  **Reference State**: Consult `progress-tracker.md` at the start of every task to understand the current state and what has already been built.

## Scoping Rules

1.  **Single Unit Focus**: Work on exactly one feature unit or bug fix at a time.
2.  **No Speculative Changes**: Do not add code for "future use" or features not defined in the current spec.
3.  **Boundary Respect**: If a task requires changes across multiple system boundaries (e.g., Database, API, and UI), implement them in a sequence of smaller, functional steps rather than all at once.

## When to Split Work

Split an implementation step immediately if it involves:
1.  **Cross-Layer Changes**: Modifying both the frontend (UI/State) and backend (API/Database) in a way that cannot be verified independently.
2.  **Multiple API Routes**: Creating or modifying more than one unrelated API endpoint.
3.  **Schema and Logic**: Combining database migration/schema changes with complex business logic implementations.
4.  **Verification Delay**: Any change that requires more than 5 minutes to verify end-to-end.

## Handling Missing or Ambiguous Requirements

1.  **Stop and Ask**: Do not guess or invent product behavior. If a requirement is unclear, stop and ask the user for clarification.
2.  **Document Assumptions**: If proceeding with an assumption (after user approval), immediately document it in the relevant context file.
3.  **Update Progress Tracker**: Record any missing requirements or open questions in the "Open Questions" section of `progress-tracker.md`.

## Protected Files

Do not modify the following files without explicit, repeated instruction:
1.  **Generated UI Components**: `client/src/components/ui/*` (shadcn/ui components). Use them as they are; wrap them in custom components if modifications are needed.
2.  **Environment Configuration**: `.env` or `.env.example` files (unless adding a new required variable).
3.  **Core Tooling**: `package.json`, `tsconfig.json`, `vite.config.ts`, or `tailwind.config.js` unless specifically requested for dependency/configuration management.

## Keeping Documentation in Sync

1.  **Continuous Updates**: Update the relevant context file *during* or *immediately after* an implementation step if decisions were made that affect the system's architecture, standards, or scope.
2.  **Sync Invariants**: Ensure that any new core logic adheres to the invariants defined in `architecture.md`.
3.  **Maintain Progress**: Mark tasks as completed in `progress-tracker.md` only after they have been verified.

## Verification Checklist

Before declaring a unit complete and moving to the next, you MUST:
1.  **Verify End-to-End**: Ensure the unit works as expected in the running application (dev server).
2.  **Check Invariants**: Confirm that no invariants in `architecture.md` (e.g., Secrets Security, Privacy, Type Safety) were violated.
3.  **Lint and Build**: Run `npm run build` (or relevant linting/type-check commands) to ensure no regressions were introduced.
4.  **Update Progress**: Reflect the current state in `progress-tracker.md`.
5.  **Clean Up**: Remove any debug logs, temporary comments, or scratch files used during development.
