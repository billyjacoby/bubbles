<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Bubbles project rules

## Product architecture

- Bubbles is a monorepo containing web and terminal BlueBubbles clients.
  Shared data models, REST calls, socket handling, and pure domain logic live
  in `packages/shared`; client-specific state and presentation stay isolated.
- The installable PWA lives in `app/web`. The browser talks directly to the
  configured BlueBubbles REST API and Socket.IO endpoint.
- The Ink terminal client lives in `app/tui` and talks directly to the same
  endpoints. Keep it portable across ordinary Node.js terminals; do not bake
  Omarchy or machine-specific assumptions into it.
- The Next.js server validates and stores connection credentials in an httpOnly
  cookie, then server-rendered layouts provide that connection to the client.
  Keep this security boundary coherent when changing authentication or routing.
- Keep message and cache state in the existing browser persistence layers.
  Never expose credentials in logs or committed fixtures.

## Portability

- Do not commit systemd units, Omarchy or Linux configuration, localhost port
  choices, absolute user paths, editor state, or other machine-specific
  deployment files.
- Repository scripts and documentation must remain portable across ordinary
  Next.js hosting environments. Keep local deployment automation outside the
  repository.

## Validation and delivery

- Preserve the direct API boundary in `packages/shared/src/api/`, realtime
  handling in `packages/shared/src/socket.ts`, React Query/IndexedDB data cache,
  and Zustand UI state in `app/web`
  unless a requested change requires modifying them.
- Run focused checks for the changed behavior, `pnpm lint`, and `pnpm build`.
  Run `pnpm verify` when conversation, contact, or sync invariants are affected.
- Commit completed changes on `main` using a short conventional-commit subject.
  Keep commits cohesive and push `main` to `origin`; never force-push.
