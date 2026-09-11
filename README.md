# Bubbles

A web client for a [BlueBubbles](https://bluebubbles.app) server, built with Next.js.

The goal is a deliberately small surface: a handful of typed modules that map
directly onto the BlueBubbles REST API and socket.io feed, so features are easy
to add without unpicking layers of abstraction.

## Getting started

```bash
pnpm install
pnpm dev
```

Open the app, and you will be sent to `/setup`. Enter your BlueBubbles server
URL and password. Credentials are validated server-side and stored in an
httpOnly cookie.

## How it connects

The browser talks to the BlueBubbles server **directly** — REST calls and the
socket.io connection both go straight from the client. Authentication is a
`?guid=<password>` query parameter; there is no header or token auth.

This means the server must allow cross-origin requests from wherever this app is
hosted. If that turns out to be a problem, the fix is to proxy through Next.js
route handlers: every outbound call already funnels through
`src/lib/api/client.ts`, so only that module and the socket connection need to
change.

The password is stored in an httpOnly cookie and read by a server component
(`src/app/chats/layout.tsx`), which hands it to the client via
`ConnectionProvider`. It never touches `localStorage`. Because the browser calls
the server directly, the password does exist in client memory — that is inherent
to this transport choice, not an oversight.

## Layout

```
src/
  app/
    api/session/route.ts    Validate credentials, set/clear the session cookie
    setup/                  Connection form
    chats/                  Authenticated shell, chat list, thread routes
  lib/
    types.ts                Server data models
    api/client.ts           Request plumbing, auth, error normalisation
    api/chats.ts            Chat + conversation endpoints
    api/messages.ts         Send, react, edit, unsend
    api/contacts.ts         Address book
    contacts.ts             Address -> contact matching and avatars
    socket.ts               socket.io connection and payload decoding
    cache.ts                Query-cache writes shared by sends and socket events
    conversations.ts        Deriving the ordered chat list from the message feed
    message-utils.ts        Deriving display text, titles, message predicates
    thread.ts               Grouping messages into renderable thread items
  hooks/                    Query, mutation and realtime-sync hooks
  components/               UI
  store/ui-store.ts         Socket connection status, typing indicators
```

## Notes on the API

A few behaviours are non-obvious and are worth knowing before extending this:

### `/chat/query` cannot produce an ordered conversation list

This one is load-bearing, so it is worth stating plainly: **the server applies
`sort: lastmessage` after `LIMIT`/`OFFSET`, not before.** Each page is sorted
only within itself, while which chats land on which page is decided by row ID.

On a real account (3554 chats) this meant conversations with messages from
*today* sat at index 3000 and 3500 — each at the top of its own 500-row page,
and nowhere near the top of the list. No page size fixes this. Compounding it,
only 48% of chats came back with `lastMessage` populated at all.

So the conversation list is derived from `/message/query` instead: fetch the
newest messages across all chats, group by `chats[0].guid`, and order by message
date. Recency comes from the messages themselves. See `deriveConversations()`
in `src/lib/conversations.ts`, and run `pnpm verify` to exercise it.

Consequences worth knowing:

- Only conversations with a message inside the loaded window appear. "Load older
  conversations" pages further back. A chat with no messages never appears,
  which is correct for a conversation list.
- Sidebar search covers loaded conversations only, which is why the placeholder
  says so. Server-side search would need a different endpoint.
- `hasUnreadMessage` on chat records embedded in messages goes stale, so unread
  state is tracked in `src/store/ui-store.ts` from first-hand signals (opening a
  chat, read-status events, incoming messages) and takes precedence.

`queryChats()` is still available for single-chat metadata and counts, and
carries a warning comment against using it for lists.

### Contact matching is looser than the reference client's

The reference client compares normalised address strings exactly. That fails
whenever an address book stores a local number — `(727) 417-4794` — while the
handle carries the international form, `+17274174794`.

`src/lib/contacts.ts` indexes each phone number under both its full digit string
and its trailing 10 digits, so those two forms meet. A trailing-10 key is only
generated for numbers long enough to have one, which keeps short codes like
`22000` matching exactly and prevents them colliding with longer numbers. Exact
matches always win over looser ones.

Contacts are fetched once with `staleTime` of an hour. Avatars come back inline
as base64 and are enabled in `useContacts()`; if your address book makes that
payload too large, flip `withAvatars` to `false` there — names still resolve.
`pnpm verify --url ... --password ...` reports the size both ways.

### Other gotchas

- **`attributedBody` is the real message text.** The plain `text` column can be
  empty or stale on modern macOS. See `messageText()`.
- **One-on-one chats often return no `participants`.** Their name comes from the
  address embedded in the chat GUID instead — see `chatTitle()`.
- **Tapbacks are separate messages.** They arrive with an
  `associatedMessageGuid` pointing at their target and must be lifted out of the
  main list — `buildThread()` does this.
- **`associatedMessageGuid` carries prefixes** like `p:0/` and `bp:`. Parse it
  with `parseAssociatedGuid()` rather than reading it raw.
- **Two send transports.** AppleScript handles plain text only. Subjects,
  replies, effects, typing indicators, reactions and edit/unsend all require the
  Private API helper. `resolveSendMethod()` picks between them, and
  `/server/info` reports whether the helper is available.
- **Optimistic sends are reconciled by `tempGuid`**, which the server echoes back
  on both the HTTP response and the socket event. The response omits `chats`, so
  the optimistic copy is preserved to keep the message attached to its
  conversation in the feed.
- **Socket payloads vary.** They may be a bare object, a JSON string, or
  AES-encrypted with the server password. `decodePayload()` normalises all three.

## Scripts

```bash
pnpm verify                                    # test conversation derivation
pnpm diagnose --url <url> --password <pw>      # server/sync health check
pnpm diagnose:chatlist --url <url> --password <pw>   # chat-list ordering check
```

`pnpm verify` also accepts `--url`/`--password` to replay live server data
through the same derivation code and assert the ordering holds.

All diagnostic scripts are read-only.

## Current scope

Working: chat list with live updates and search, contact names and photos,
message thread with pagination, sending text, typing indicators, read receipts,
attachment rendering, tapback display, replies, edits and unsends.

Not yet built: attachment upload, sending tapbacks/effects/mentions from the UI,
group management, FaceTime, scheduled messages, server-side search.
