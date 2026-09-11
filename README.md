# Bubbles

Web and terminal clients for a [BlueBubbles](https://bluebubbles.app) server.
The Next.js PWA and Ink TUI share one typed protocol/domain package, so fixes to
message parsing, contacts, sending, and realtime events apply to both clients.

The goal is a deliberately small surface: a handful of typed modules that map
directly onto the BlueBubbles REST API and socket.io feed, so features are easy
to add without unpicking layers of abstraction.

## Getting started

```bash
pnpm install
pnpm dev:web
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
`packages/shared/src/api/client.ts`, so only that module and the socket connection need to
change.

The password is stored in an httpOnly cookie and read by a server component
(`app/web/src/app/chats/layout.tsx`), which hands it to the client via
`ConnectionProvider`. It never touches `localStorage`. Because the browser calls
the server directly, the password does exist in client memory — that is inherent
to this transport choice, not an oversight.

## Terminal client

Run the TUI with connection details in flags:

```bash
pnpm tui -- --server https://bluebubbles.example.com --password 'secret'
```

Or keep credentials out of shell history by using environment variables:

```bash
export BLUEBUBBLES_URL=https://bluebubbles.example.com
export BLUEBUBBLES_PASSWORD='secret'
pnpm tui
```

Use `j`/`k` or the arrow keys to select a chat, `Enter`, `i`, or `Tab` to
compose, `Escape` to return to navigation, `r` to refresh, and `q` to quit.
Incoming messages update over Socket.IO. Outgoing iMessages render blue and SMS
messages green, matching the web client.

## Layout

```
app/
  web/
    src/app/
    api/session/route.ts    Validate credentials, set/clear the session cookie
    setup/                  Connection form
    chats/                  Authenticated shell, chat list, thread routes
    src/lib/                Browser cache, session, and UI utilities
    src/hooks/              Query, mutation, realtime and delta-sync hooks
    src/components/         Web UI
    src/store/              Browser UI and preference state
  tui/
    src/                    Ink terminal UI and CLI
packages/
  shared/src/
    api/                    BlueBubbles REST boundary
    types.ts                Server data models
    socket.ts               Socket.IO connection and payload decoding
    contacts.ts             Address -> contact matching
    conversations.ts        Ordered conversation derivation
    message-utils.ts        Display text, titles, message predicates
    thread.ts               Renderable thread grouping
```

## Themes

Use the palette control beside the connection status to switch between
Hackerman, System, Light, and Dark. The choice is stored in `localStorage` for
the current browser profile. Hackerman is the default and uses a terminal-like
monospace treatment; the other themes retain the standard interface typography.

## Installing as a PWA

The app ships a web manifest (`app/web/src/app/manifest.ts`), icons, and a service
worker, so it installs as a standalone desktop app. Install from the browser's
address bar; it opens in its own window at `/chats`.

The service worker (`app/web/public/sw.js`) is deliberately narrow — **app shell and
static assets only**. Message data is already cached in IndexedDB by React
Query, and caching it twice would risk serving a stale conversation from a layer
that knows nothing about the sync watermark. It never touches cross-origin
requests (your BlueBubbles server) or `/api/*` (session credentials).

It registers in production builds only; in development a cached shell masks code
changes. Bump `VERSION` in `app/web/public/sw.js` to force old caches out.

Icons are generated procedurally, with no image-library dependency:

```bash
node scripts/generate-icons.mjs --preview
```

`--preview` prints an ASCII rendering so the artwork can be checked without an
image viewer. Edit the drawing code in that script and re-run to change the
icon.

## Pinned conversations

Modelled on Messages: pinned conversations render as a grid of circular avatars
above the list, **not** as list rows, and are removed from the list below — a
pinned chat appears in one place, never both. Capped at nine, as Messages is.

- A bubble floats above an avatar when there is something new: someone typing,
  or an unread message from them.
- Unread shows as a badge on the avatar rather than a dot in a row.
- Drag a tile to reorder; order is positional and never reshuffles with
  activity.
- Hover a tile for an unpin control. Rows in the list below have a pin control,
  as does the conversation header.
- Searching hides the grid and searches across both sections, so a pinned chat
  is still findable by name.

Pins live in `localStorage` (`app/web/src/store/pin-store.ts`) and are **per browser
profile, not per account** — the server has no concept of them. `/chat/query`
returns no `isPinned` field and there is no endpoint to set one; the official
client keeps pins in its own local database too.

`partitionPins()` in `packages/shared/src/conversations.ts` splits the two sections. A
pinned chat outside the loaded message window is skipped rather than dropped
from the pin list, and reappears in place once the feed reaches it.

## Caching and sync

The app is built to be installed as a desktop PWA, so a cold start must not
refetch the world.

**The cache is persisted to IndexedDB.** The whole React Query cache is
dehydrated into IndexedDB (`app/web/src/lib/persister.ts`) and restored on load, so a
reload paints from cache immediately. IndexedDB rather than localStorage: a
conversation window plus contact avatars runs to several megabytes, past
localStorage's ~5MB ceiling, and structured clones avoid a JSON round-trip on
every write.

**Queries do not refetch on a timer.** `staleTime` defaults to `Infinity`, with
`gcTime` at 24 hours — a query garbage-collected from memory would be dropped
from the next write to disk, so `gcTime` must outlive what you want persisted.
Freshness comes from two places instead: the socket while connected, and a delta
sync on load.

**Delta sync is row-ID based.** `app/web/src/hooks/use-delta-sync.ts` reads the highest
row ID in the cached feed and asks only for messages above it, using the raw-SQL
`where` clause the server exposes on `/message/query`. Row ID rather than a
timestamp because it is monotonic: messages sharing a millisecond cannot be
skipped, and a server clock adjustment cannot make the window miss anything.
A timestamp window is the fallback when row IDs are absent.

Note the field name: **`/message/query` serialises the chat.db row ID as
`originalROWID`, not `ROWID`**, while the `where` clause filters on the SQL
column `message.ROWID`. Same underlying value, two names — `messageRowId()` in
`packages/shared/src/sync.ts` reads whichever is present. Measured against a real server, a
delta returned 24 messages in 117ms where the full window is 1000 in ~1s.

It runs once restoration completes, and again on every socket reconnect — a
dropped connection is exactly when messages get missed. Optimistic messages are
excluded from the watermark, or a failed send would pin it to a bogus value.

Cold start, in order:

1. IndexedDB cache restores; conversations and threads render.
2. Delta sync pulls messages above the cached row ID.
3. The socket connects and takes over live updates.

Bump `CACHE_BUSTER` in `app/web/src/lib/persister.ts` when the cached shape changes
incompatibly; a mismatched buster discards the stored cache.

### Known gaps

- **Edits, unsends and read receipts that land while the app is closed are not
  caught by delta sync.** It queries messages above a row ID, and an edit does
  not create a new row. They arrive correctly over the socket while connected;
  closing the app during one means it shows stale until that thread is refetched.
  Catching these needs `/message/count/updated` plus a date-based query.
- **Cached threads are bounded by `gcTime`**, so chats not opened in 24 hours
  drop out of the cache and reload on next open.

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
in `packages/shared/src/conversations.ts`, and run `pnpm verify` to exercise it.

Consequences worth knowing:

- Only conversations with a message inside the loaded window appear. "Load older
  conversations" pages further back. A chat with no messages never appears,
  which is correct for a conversation list.
- Sidebar search covers loaded conversations only, which is why the placeholder
  says so. Server-side search would need a different endpoint.
- `hasUnreadMessage` on chat records embedded in messages goes stale, so unread
  state is tracked in `app/web/src/store/ui-store.ts` from first-hand signals (opening a
  chat, read-status events, incoming messages) and takes precedence.

`queryChats()` is still available for single-chat metadata and counts, and
carries a warning comment against using it for lists.

### Contact matching is looser than the reference client's

The reference client compares normalised address strings exactly. That fails
whenever an address book stores a local number — `(727) 417-4794` — while the
handle carries the international form, `+17274174794`.

`packages/shared/src/contacts.ts` indexes each phone number under both its full digit string
and its trailing 10 digits, so those two forms meet. A trailing-10 key is only
generated for numbers long enough to have one, which keeps short codes like
`22000` matching exactly and prevents them colliding with longer numbers. Exact
matches always win over looser ones.

Contacts are fetched once and persisted, **names only**. On a real 662-contact
address book, names alone are 0.2MB in ~300ms while fetching every photo is
8.7MB in ~3.2s — about 40x the payload for avatars that exist on 11% of
contacts, and that cost would be re-paid on every write of the persisted cache.

Photos are instead fetched **per contact, on demand**. `app/web/src/lib/avatar-loader.ts`
coalesces every avatar requested within 50ms into a single `/contact/query`
(max 20 addresses), and each address is cached and persisted separately so a
photo is fetched once and then survives reloads. Requests only fire for
addresses that resolved to a known contact, so short codes and businesses never
trigger one. Measured: 20 avatars in ~800ms and ~1.1MB, against 8.7MB for the
whole book.

Note `/contact/query` only honours `extraProperties` in the **body** — passing
it as a query parameter is silently ignored and you get contacts with no
photos.

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
pnpm verify              # conversation, contact and sync-watermark checks
pnpm diagnose            # server/sync health check
pnpm diagnose:chatlist   # chat-list ordering check
```

All three are **read-only** — they issue only GETs and query POSTs, and never
send, modify or delete anything.

They run app modules directly via `scripts/register-alias.mjs`, which teaches
Node the `@/*` path alias. That means tests exercise the real implementation
rather than a copy of it; keep app code free of TypeScript syntax that needs a
transform rather than stripping (constructor parameter properties, enums) or
those imports will fail.

Credentials resolve in this order: `--url` / `--password` flags, then `BB_URL` /
`BB_PASSWORD` environment variables, then `.env.local` at the repo root. Copy
`.env.example` to `.env.local` and fill in the password:

```
BB_URL=https://your-server
BB_PASSWORD=your-password
```

`.env.local` is gitignored. With it in place the scripts need no arguments.

`pnpm verify` runs its fixture checks with or without credentials; the live
checks are skipped when none are available, so it is always safe to run.

## Current scope

Working: chat list with live updates, search and pinning, contact names and
photos, message thread with pagination, sending text, typing indicators, read
receipts, attachment rendering, tapback display, replies, edits and unsends.
Installable as a desktop PWA with offline shell and persisted cache.

Not yet built: attachment upload, sending tapbacks/effects/mentions from the UI,
group management, FaceTime, scheduled messages, server-side search, push
notifications.
