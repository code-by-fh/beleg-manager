# Code Standards

## General

- **Single Responsibility**: Keep modules, components, and functions small and focused on a single task.
- **Spec-Driven Development**: Always refer to the `context/` documentation before implementing new features.
- **Fail Fast**: Validate data at system boundaries (API inputs, DB results) using Zod to prevent cascading errors.
- **Logging**: Use the centralized `pino` logger. Never use `console.log` in production-bound code.

## TypeScript

- **Strict Mode**: `strict: true` is mandatory in both client and server `tsconfig.json`.
- **No `any`**: Avoid the `any` type at all costs. Use `unknown` with type guards or define explicit interfaces/types.
- **Exhaustive Checks**: Use discriminating unions for state and action types to ensure all cases are handled.
- **Naming**: Use PascalCase for components/interfaces, camelCase for variables/functions, and UPPER_SNAKE_CASE for constants.

## React & Vite (Client)

- **Functional Components**: Use functional components with hooks. Avoid class components.
- **State Management**: Use TanStack Query for server state and standard React `useState`/`useContext` for local/global UI state.
- **Component Structure**: Use Shadcn UI as the foundation. Keep components in `client/src/components` and pages in `client/src/pages`.
- **Hooks**: Extract complex logic into custom hooks in `client/src/hooks`.

## Express (Server)

- **Route Structure**: Organize routes by domain (e.g., `/api/receipts`, `/api/auth`) in `server/src/[module]`.
- **Middleware**: Use standard middleware for Auth (`passport`), Rate Limiting (`express-rate-limit`), and Security (`helmet`).
- **Error Handling**: Use an async-aware global error handler. Return consistent JSON response shapes.

## Styling

- **Tailwind CSS**: Use utility classes for all styling. Avoid custom CSS files unless defining theme variables in `index.css`.
- **Theme Variables**: Use CSS variables for colors, spacing, and border-radii as defined in `ui-context.md`.
- **Responsive Design**: Mobile-first approach using Tailwind's responsive prefixes (`sm:`, `md:`, `lg:`).

## API Routes

- **Validation**: Every route MUST have a Zod schema for `req.body`, `req.query`, and `req.params`.
- **Auth**: Enforce authentication for all non-public routes using the `isAuthenticated` middleware.
- **Response Shape**: Always return objects (e.g., `{ data: ... }` or `{ error: ... }`), never raw arrays or strings.

## Data and Storage

- **Persistence Layer**:
  - **Google Sheets**: Final source of truth for receipt data.
  - **Google Drive**: Final source of truth for document files (PDFs, Images).
  - **SQLite**: Local cache for sessions, user settings, and synchronization status.
- **Invariants**: Do not store binary data in SQLite; store the Drive File ID instead.

## File Organization

- `client/src/components/ui/` — Base UI components (Shadcn/UI).
- `client/src/pages/` — Main view components mapped to routes.
- `server/src/[domain]/` — Domain-driven folders (e.g., `receipts`, `auth`) containing `.routes.ts`, `.service.ts`, and `.schema.ts`.
- `server/src/google/` — Low-level Google API wrappers (Drive, Sheets).
- `context/` — Project documentation and AI instructions.
