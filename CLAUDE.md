# Project: Realtime Collaborative Editor

## Stack

- Frontend: React + Vite + TypeScript, TipTap editor
- Backend: Node + Fastify + Hocuspocus (WebSocket), single process
- DB: PostgreSQL via Drizzle ORM
- Cache/PubSub: Redis
- CRDT: Yjs

## Conventions

- TypeScript strict mode everywhere
- No `any` without a comment explaining why
- Server: all permission checks go through `server/src/permissions.ts`, never inline
- Keep the API server and WebSocket server in one process sharing one HTTP listener

## Non-negotiables

- Access control is enforced server-side. Client-side disabling is UI only.
- Never store document content as HTML/markdown. Yjs state is a binary blob.
