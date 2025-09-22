# Repository Guidelines

## Project Structure & Module Organization
The Vite + React client lives under `src`, organized by domain in `src/features/*` (e.g., `attendance`, `market`, `tasks`) and shared utilities/components in `src/shared`. Global config and bootstrap code remain in `src/App.jsx`, `src/main.jsx`, and `src/routes.jsx`. Firebase Cloud Functions reside in `functions/index.js`, with per-service helpers under `functions/`. Static assets and HTML shells sit in `public/`, while CDN-ready builds land in `dist/` after compilation.

## Build, Test, and Development Commands
Run `npm install` once in the repository root (and `npm --prefix functions install` for Functions). Use `npm run dev` for the Vite dev server, `npm run build` to produce a production bundle, and `npm run preview` to smoke test the built output. `npm run lint` enforces ESLint. For backend emulation, run `npm run serve` from the `functions` folder to start the Firebase Functions emulator suite.

## Coding Style & Naming Conventions
Front-end code follows the project ESLint config (`eslint.config.js`) with 2-space indentation, semicolons, and double quotes for strings. Name React components using `PascalCase` and colocate feature-specific hooks/components inside the matching `src/features/<domain>/` folder. Reusable pieces belong in `src/shared/components` or `src/shared/utils`. Tailwind utility classes drive styling; keep bespoke CSS in `src/index.css` or scoped module files. Firebase Functions adhere to the Google ESLint preset and should export `camelCase` handlers.

## Testing Guidelines
No automated React tests are wired in yet; prefer `Vitest` + React Testing Library if you add coverage, naming files `*.test.jsx` beside the component. For Functions, use `firebase-functions-test` with test files under `functions/__tests__/`. Always validate critical flows manually through `npm run dev` and document any gaps in the PR. Block merges if smoke tests fail or API changes lack coverage.

## Commit & Pull Request Guidelines
The git history is currently empty, so adopt Conventional Commits (e.g., `feat: add attendance summary widget`) until a project-specific pattern emerges. Each PR should describe scope, testing evidence, and linked issue IDs; attach screenshots or emulator logs for UI or backend-visible changes. Request reviews from domain owners (`features/<domain>` maintainers) and ensure lint/build pipelines pass before asking for merge.

## Security & Configuration Tips
Store environment secrets in `.env` files consumed by Vite (`VITE_*`) and avoid committing Firebase credentials; update `src/firebase.js` to read from env when available. Node 20 is required for Functions; use the specified engine when running emulators or deploying. Before deployments, run `npm run build` and `npm run lint` locally, and double-check Firebase rules or indexes changes are included.
