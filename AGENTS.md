# Agent Guidelines

## Repository overview
- This workspace is managed with npm; run checks with `npm test` and `npm run lint` where applicable.
- Source TypeScript lives under `packages/` and `src/`; prefer TypeScript-first contributions.

## Coding conventions
- Follow existing lint rules; do not introduce new lint suppressions unless required.
- Prefer named exports when adding new modules.
- Keep functions small and composable; avoid side effects in utilities.

## Testing
- For changes touching packages under `packages/`, add or update Vitest suites alongside the code.
- For server integrations, prefer integration tests under `test/` that exercise the public API.

## Documentation
- Update README or docs/ when behavior changes.

<3
