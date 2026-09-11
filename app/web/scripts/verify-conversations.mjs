#!/usr/bin/env node
/**
 * Exercise the real deriveConversations implementation.
 *
 * Fixture checks always run. Live checks additionally replay real server data
 * through the same code path, and run when credentials are available from
 * .env.local (see .env.example) or --url/--password.
 */

import assert from "node:assert/strict";
import { loadConfig, makeApi } from "./config.mjs";
import { loadContactAvatar } from "../src/lib/avatar-loader.ts";
import {
  addressKeys,
  buildContactIndex,
  chatPreview,
  chatService,
  conversationChat,
  deltaWindow,
  deriveConversations,
  initialsFor,
  lookupContact,
  messageRowId,
  messageService,
  newestRowId,
  newestTimestamp,
  partitionPins,
  chatTitle,
} from "@bubbles/shared";

let failures = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  PASS  ${name}`);
  } catch (err) {
    failures += 1;
    console.log(`  FAIL  ${name}\n        ${err.message}`);
  }
}

const chat = (guid, extra = {}) => ({ guid, ...extra });
const msg = (guid, chatObj, dateCreated, extra = {}) => ({
  guid,
  isFromMe: false,
  dateCreated,
  chats: [chatObj],
  ...extra,
});

console.log("\nFixtures");

test("orders conversations by newest message, not feed position", () => {
  const out = deriveConversations([
    msg("m1", chat("A"), 300),
    msg("m2", chat("B"), 500),
    msg("m3", chat("C"), 100),
  ]);
  assert.deepEqual(
    out.map((c) => c.chat.guid),
    ["B", "A", "C"],
  );
});

test("keeps the newest message as the preview", () => {
  const out = deriveConversations([
    msg("new", chat("A"), 900),
    msg("old", chat("A"), 100),
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].lastMessage.guid, "new");
  assert.equal(out[0].activity, 900);
});

test("newest-message ordering holds even if the feed is out of order", () => {
  const out = deriveConversations([
    msg("old", chat("A"), 100),
    msg("new", chat("A"), 900),
  ]);
  assert.equal(out[0].lastMessage.guid, "new");
  assert.equal(out[0].activity, 900);
});

test("prefers the richest chat record across messages", () => {
  // An optimistic send attaches only a GUID; the richer copy must survive.
  const rich = chat("A", {
    displayName: "Team",
    participants: [{ address: "+15551234567" }],
    style: 43,
  });
  const out = deriveConversations([
    msg("optimistic", chat("A"), 900),
    msg("server", rich, 100),
  ]);
  assert.equal(out[0].chat.displayName, "Team");
  assert.equal(out[0].chat.participants.length, 1);
  // ...without losing the newer message as the preview.
  assert.equal(out[0].lastMessage.guid, "optimistic");
});

test("ignores messages with no chat attached", () => {
  const out = deriveConversations([
    { guid: "orphan", isFromMe: false, dateCreated: 999 },
    msg("m1", chat("A"), 100),
  ]);
  assert.deepEqual(
    out.map((c) => c.chat.guid),
    ["A"],
  );
});

test("conversationChat exposes lastMessage for preview helpers", () => {
  const out = deriveConversations([msg("m1", chat("A"), 500, { text: "hi" })]);
  assert.equal(conversationChat(out[0]).lastMessage.text, "hi");
});

test("handles an empty feed", () => {
  assert.deepEqual(deriveConversations([]), []);
});

console.log("\nMessage service");

test("reads iMessage and SMS from chat GUIDs", () => {
  assert.equal(chatService({ guid: "iMessage;-;+15551234567" }), "iMessage");
  assert.equal(chatService({ guid: "SMS;-;+15551234567" }), "SMS");
});

test("resolves an ambiguous chat from participant metadata", () => {
  assert.equal(
    chatService({
      guid: "any;-;+15551234567",
      participants: [{ address: "+15551234567", service: "SMS" }],
    }),
    "SMS",
  );
});

test("prefers per-message service metadata over the chat", () => {
  assert.equal(
    messageService({
      guid: "m1",
      isFromMe: true,
      handle: { address: "+15551234567", service: "SMS" },
      chats: [{ guid: "iMessage;-;+15551234567" }],
    }),
    "SMS",
  );
});

test("reports an unknown service when the server data is ambiguous", () => {
  assert.equal(chatService({ guid: "any;-;+15551234567" }), null);
});

console.log("\nPinned conversations");

const conv = (guid) => ({ chat: { guid } });
const guids = (list) => list.map((c) => c.chat.guid);

test("pinned conversations are ordered by pin order, not activity", () => {
  // "c" is least recent but pinned first, so it leads the grid.
  const { pinned } = partitionPins([conv("a"), conv("b"), conv("c")], ["c", "a"]);
  assert.deepEqual(guids(pinned), ["c", "a"]);
});

test("pinned conversations are removed from the list below", () => {
  // Messages shows a pinned chat in the grid only, never in both.
  const { unpinned } = partitionPins([conv("a"), conv("b"), conv("c")], ["c", "a"]);
  assert.deepEqual(guids(unpinned), ["b"]);
});

test("unpinned conversations keep their recency order", () => {
  const { unpinned } = partitionPins([conv("a"), conv("b"), conv("c")], ["b"]);
  assert.deepEqual(guids(unpinned), ["a", "c"]);
});

test("a pin held by no loaded conversation is skipped, not fatal", () => {
  // The chat may be outside the loaded window; it should reappear in place
  // once the feed reaches it, not break the grid or vanish from the pin list.
  const { pinned, unpinned } = partitionPins([conv("a"), conv("b")], ["missing", "b"]);
  assert.deepEqual(guids(pinned), ["b"]);
  assert.deepEqual(guids(unpinned), ["a"]);
});

test("no pins leaves the list untouched", () => {
  const input = [conv("a"), conv("b")];
  const { pinned, unpinned } = partitionPins(input, []);
  assert.deepEqual(pinned, []);
  assert.equal(unpinned, input);
});

test("every conversation lands in exactly one section", () => {
  const input = ["a", "b", "c", "d", "e"].map(conv);
  const { pinned, unpinned } = partitionPins(input, ["d", "b"]);
  assert.equal(pinned.length + unpinned.length, input.length);
  assert.deepEqual([...guids(pinned), ...guids(unpinned)].sort(), [
    "a", "b", "c", "d", "e",
  ]);
});

console.log("\nPin store");

// The store persists to localStorage, which Node has no implementation of.
// Shimming it rather than stubbing the store means the persistence path is
// exercised too, not bypassed.
globalThis.localStorage ??= (() => {
  const map = new Map();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, String(value)),
    removeItem: (key) => void map.delete(key),
    clear: () => map.clear(),
    key: (i) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  };
})();

// Exercise the real store rather than a copy of its logic.
const { usePinStore, MAX_PINS } = await import("../src/store/pin-store.ts");
const pinApi = usePinStore.getState;
const resetPins = () => usePinStore.setState({ pinned: [] });

test("toggle pins and unpins", () => {
  resetPins();
  pinApi().toggle("a");
  assert.deepEqual(pinApi().pinned, ["a"]);
  pinApi().toggle("a");
  assert.deepEqual(pinApi().pinned, []);
});

test("newly pinned goes last, so existing pins do not jump", () => {
  resetPins();
  pinApi().toggle("a");
  pinApi().toggle("b");
  assert.deepEqual(pinApi().pinned, ["a", "b"]);
});

test(`pinning is capped at ${MAX_PINS}, as in Messages`, () => {
  resetPins();
  for (let i = 0; i < MAX_PINS + 3; i += 1) pinApi().toggle(`chat-${i}`);
  assert.equal(pinApi().pinned.length, MAX_PINS);
  // The earliest pins survive; the overflow is refused.
  assert.equal(pinApi().pinned[0], "chat-0");
  assert.ok(!pinApi().pinned.includes(`chat-${MAX_PINS}`));
});

test("unpinning at the cap frees a slot", () => {
  resetPins();
  for (let i = 0; i < MAX_PINS; i += 1) pinApi().toggle(`chat-${i}`);
  pinApi().toggle("chat-0");
  pinApi().toggle("new");
  assert.equal(pinApi().pinned.length, MAX_PINS);
  assert.ok(pinApi().pinned.includes("new"));
});

test("reorder moves a pin to an absolute position", () => {
  resetPins();
  usePinStore.setState({ pinned: ["a", "b", "c", "d"] });
  pinApi().reorder("d", 0);
  assert.deepEqual(pinApi().pinned, ["d", "a", "b", "c"]);
  pinApi().reorder("d", 2);
  assert.deepEqual(pinApi().pinned, ["a", "b", "d", "c"]);
});

test("reorder clamps out-of-range targets and ignores unknown pins", () => {
  resetPins();
  usePinStore.setState({ pinned: ["a", "b", "c"] });
  pinApi().reorder("a", 99);
  assert.deepEqual(pinApi().pinned, ["b", "c", "a"]);
  pinApi().reorder("nope", 0);
  assert.deepEqual(pinApi().pinned, ["b", "c", "a"]);
});

test("reorder never loses or duplicates a pin", () => {
  resetPins();
  usePinStore.setState({ pinned: ["a", "b", "c", "d", "e"] });
  pinApi().reorder("c", 4);
  pinApi().reorder("a", 2);
  const out = pinApi().pinned;
  assert.equal(out.length, 5);
  assert.deepEqual([...out].sort(), ["a", "b", "c", "d", "e"]);
});

resetPins();

console.log("\nContact matching");

const contacts = [
  {
    id: "c1",
    displayName: "Ada Lovelace",
    // Stored in local format, with no country code.
    phoneNumbers: [{ address: "(727) 417-4794" }],
  },
  {
    id: "c2",
    firstName: "Grace",
    lastName: "Hopper",
    phoneNumbers: [{ address: "+1 617-750-2185" }],
    emails: [{ address: "Grace@Example.COM" }],
  },
  { id: "c3", displayName: "Short Code", phoneNumbers: [{ address: "22000" }] },
];
const index = buildContactIndex(contacts);

test("matches a local-format contact against an E.164 handle", () => {
  // This is the case the reference client's exact-string matching misses.
  assert.equal(lookupContact(index, "+17274174794")?.name, "Ada Lovelace");
});

test("matches an E.164 contact against a bare national handle", () => {
  assert.equal(lookupContact(index, "6177502185")?.name, "Grace Hopper");
});

test("builds a display name from first and last name", () => {
  assert.equal(lookupContact(index, "+16177502185")?.name, "Grace Hopper");
});

test("matches emails case-insensitively", () => {
  assert.equal(lookupContact(index, "grace@example.com")?.name, "Grace Hopper");
});

test("matches short codes exactly, without a trailing-10 key", () => {
  assert.equal(lookupContact(index, "22000")?.name, "Short Code");
  assert.deepEqual(addressKeys("22000"), ["22000"]);
});

test("a short code never collides with a longer number", () => {
  // "4794" must not resolve to Ada just because her number ends with it.
  assert.equal(lookupContact(index, "4794"), undefined);
});

test("returns undefined for unknown and empty addresses", () => {
  assert.equal(lookupContact(index, "+15550000000"), undefined);
  assert.equal(lookupContact(index, ""), undefined);
  assert.equal(lookupContact(index, null), undefined);
});

test("skips contacts with no usable name", () => {
  const sparse = buildContactIndex([{ id: "x", phoneNumbers: [{ address: "+15551112222" }] }]);
  assert.equal(lookupContact(sparse, "+15551112222"), undefined);
});

test("an exact match is not displaced by a looser one", () => {
  // Both contacts share trailing 10 digits; the exact full-number match wins.
  const ambiguous = buildContactIndex([
    { id: "a", displayName: "Exact", phoneNumbers: [{ address: "7274174794" }] },
    { id: "b", displayName: "Looser", phoneNumbers: [{ address: "+447274174794" }] },
  ]);
  assert.equal(lookupContact(ambiguous, "7274174794")?.name, "Exact");
  assert.equal(lookupContact(ambiguous, "+447274174794")?.name, "Looser");
});

test("exposes avatars as data URLs", () => {
  const withAvatar = buildContactIndex([
    { id: "a", displayName: "Pic", avatar: "AAAA", phoneNumbers: [{ address: "+15551234567" }] },
  ]);
  assert.match(lookupContact(withAvatar, "+15551234567").avatar, /^data:image\/jpeg;base64,AAAA$/);
});

test("chat titles use contact names when resolvable", () => {
  const resolve = (address) => lookupContact(index, address)?.name;
  const chat1on1 = { guid: "iMessage;-;+17274174794" };
  assert.equal(chatTitle(chat1on1, resolve), "Ada Lovelace");
  // Falls back to a formatted number when unknown.
  assert.equal(chatTitle({ guid: "iMessage;-;+15550000000" }, resolve), "(555) 000-0000");
});

test("group titles resolve each participant", () => {
  const resolve = (address) => lookupContact(index, address)?.name;
  const group = {
    guid: "iMessage;+;chat123",
    participants: [{ address: "+17274174794" }, { address: "+16177502185" }],
  };
  assert.equal(chatTitle(group, resolve), "Ada Lovelace, Grace Hopper");
});

test("initials come from the resolved name, not the number", () => {
  assert.equal(initialsFor("Ada Lovelace"), "AL");
  assert.equal(initialsFor("(727) 417-4794"), "#");
  assert.equal(initialsFor(""), "?");
});

console.log("\nIncremental sync watermark");

test("reads the row id the server actually sends (originalROWID)", () => {
  // /message/query serialises the chat.db row id as originalROWID, not ROWID.
  assert.equal(messageRowId({ guid: "a", originalROWID: 245711 }), 245711);
  // An explicit ROWID still wins when present.
  assert.equal(messageRowId({ guid: "a", ROWID: 5, originalROWID: 9 }), 5);
  assert.equal(messageRowId({ guid: "a" }), undefined);
});

test("watermark uses originalROWID when that is all the server sent", () => {
  assert.deepEqual(deltaWindow([{ guid: "a", originalROWID: 245711 }]), {
    kind: "rowId",
    startRowId: 245711,
  });
});

test("takes the highest row id, regardless of feed order", () => {
  assert.equal(
    newestRowId([
      { guid: "a", ROWID: 10 },
      { guid: "b", originalROWID: 99 },
      { guid: "c", ROWID: 42 },
    ]),
    99,
  );
});

test("optimistic messages never advance the watermark", () => {
  // A temp message has no row id; if it were counted as 0 that is harmless,
  // but a future client-assigned id must not be trusted either.
  assert.equal(
    newestRowId([
      { guid: "temp-abc", originalROWID: 999999 },
      { guid: "real", originalROWID: 7 },
    ]),
    7,
  );
});

test("optimistic messages never advance the timestamp watermark", () => {
  assert.equal(
    newestTimestamp([
      { guid: "temp-abc", dateCreated: 9_999_999 },
      { guid: "real", dateCreated: 500 },
    ]),
    500,
  );
});

test("prefers a row-id window when row ids are present", () => {
  assert.deepEqual(
    deltaWindow([{ guid: "a", ROWID: 12, dateCreated: 500 }]),
    { kind: "rowId", startRowId: 12 },
  );
});

test("falls back to a timestamp window when row ids are missing", () => {
  assert.deepEqual(deltaWindow([{ guid: "a", dateCreated: 500 }]), {
    kind: "timestamp",
    after: 500,
  });
});

test("reports no window when there is nothing cached", () => {
  assert.deepEqual(deltaWindow([]), { kind: "none" });
});

test("reports no window when only optimistic messages are cached", () => {
  // Otherwise a failed first send would pin the watermark to a bogus value and
  // suppress the initial load.
  assert.deepEqual(deltaWindow([{ guid: "temp-x", dateCreated: 900 }]), {
    kind: "none",
  });
});

test("handles messages with neither row id nor date", () => {
  assert.deepEqual(deltaWindow([{ guid: "a" }]), { kind: "none" });
});

// ---------------------------------------------------------------------------

const config = loadConfig({ required: false });

if (config) {
  const api = makeApi(config);

  console.log("\nLive server");

  const { json } = await api("/message/query", {
    method: "POST",
    body: {
      with: ["chats", "chats.participants", "attributedBody", "handle"],
      sort: "DESC",
      offset: 0,
      limit: 1000,
      after: null,
      before: null,
    },
  });
  const messages = json.data ?? [];
  const derived = deriveConversations(messages);

  console.log(`  ${messages.length} messages -> ${derived.length} conversations`);

  test("live: ordering is strictly newest-first", () => {
    for (let i = 1; i < derived.length; i += 1) {
      assert.ok(
        derived[i - 1].activity >= derived[i].activity,
        `index ${i} out of order`,
      );
    }
  });

  test("live: every conversation has a last message and a guid", () => {
    for (const c of derived) {
      assert.ok(c.chat.guid, "missing chat guid");
      assert.ok(c.lastMessage, "missing last message");
    }
  });

  test("live: no duplicate conversations", () => {
    const guids = derived.map((c) => c.chat.guid);
    assert.equal(new Set(guids).size, guids.length);
  });

  const startOfToday = new Date().setHours(0, 0, 0, 0);
  const todayGuids = new Set(
    messages
      .filter((m) => (m.dateCreated ?? 0) >= startOfToday)
      .map((m) => m.chats?.[0]?.guid)
      .filter(Boolean),
  );

  test("live: today's chats appear at the top of the list", () => {
    if (todayGuids.size === 0) {
      console.log("        (no messages today — skipped)");
      return;
    }
    const topSlice = derived.slice(0, todayGuids.size).map((c) => c.chat.guid);
    for (const guid of todayGuids) {
      assert.ok(topSlice.includes(guid), `${guid} not in the top ${todayGuids.size}`);
    }
  });

  // -------------------------------------------------------------------------
  console.log("\nLive contacts");

  async function fetchContacts(withAvatars) {
    const started = Date.now();
    const { json: body, bytes } = await api("/contact", {
      query: withAvatars ? { extraProperties: "avatar" } : {},
    });
    return { contacts: body.data ?? [], bytes, ms: Date.now() - started };
  }

  const plain = await fetchContacts(false);
  const withAvatars = await fetchContacts(true);

  const mb = (n) => `${(n / 1024 / 1024).toFixed(1)} MB`;
  console.log(`  without avatars: ${plain.contacts.length} contacts, ${mb(plain.bytes)}, ${plain.ms}ms`);
  console.log(`  with avatars   : ${withAvatars.contacts.length} contacts, ${mb(withAvatars.bytes)}, ${withAvatars.ms}ms`);

  const contactIndex = buildContactIndex(withAvatars.contacts);
  const resolveLive = (address) => lookupContact(contactIndex, address)?.name;

  const withAvatarCount = withAvatars.contacts.filter((c) => c.avatar).length;
  console.log(`  contacts having an avatar: ${withAvatarCount}/${withAvatars.contacts.length}`);

  test("live: contacts endpoint returns a usable address book", () => {
    assert.ok(withAvatars.contacts.length > 0, "no contacts returned");
  });

  const resolvedNames = derived.filter((c) =>
    Boolean(resolveLive(c.chat.guid.split(";").slice(2).join(";"))),
  ).length;
  console.log(
    `  conversations resolving to a contact name: ${resolvedNames}/${derived.length}`,
  );

  console.log("\n  Top 10 as the sidebar will render them:");
  for (const c of derived.slice(0, 10)) {
    const chat = conversationChat(c);
    console.log(
      `    ${new Date(c.activity).toLocaleString().padEnd(24)} ` +
        `${chatTitle(chat, resolveLive).slice(0, 26).padEnd(26)} ${chatPreview(chat, resolveLive).slice(0, 30)}`,
    );
  }

  // -------------------------------------------------------------------------
  console.log("\nLive lazy avatars");

  const conn = { serverUrl: config.origin, password: config.password };
  const pics = withAvatars.contacts.filter((c) => c.avatar && c.phoneNumbers?.length);
  const noPics = withAvatars.contacts.filter((c) => !c.avatar && c.phoneNumbers?.length);

  const avatarTargets = [
    ...pics.slice(0, 12).map((c) => ({ address: c.phoneNumbers[0].address, expect: true })),
    ...noPics.slice(0, 6).map((c) => ({ address: c.phoneNumbers[0].address, expect: false })),
    // Neither of these is a contact, so neither should produce a photo.
    { address: "+15550001111", expect: false },
    { address: "22000", expect: false },
  ];

  const avatarStart = Date.now();
  const avatars = await Promise.all(
    avatarTargets.map((t) => loadContactAvatar(conn, t.address)),
  );
  const avatarMs = Date.now() - avatarStart;
  const avatarBytes = avatars.filter(Boolean).reduce((n, a) => n + a.length, 0);

  console.log(
    `  ${avatarTargets.length} requested concurrently -> ${avatarMs}ms, ` +
      `${(avatarBytes / 1024).toFixed(0)}KB (batched, max 20 per request)`,
  );

  test("live: lazy avatars resolve to the right contacts", () => {
    const wrong = avatarTargets
      .map((t, i) => ({ ...t, got: Boolean(avatars[i]) }))
      .filter((t) => t.got !== t.expect);
    assert.equal(
      wrong.length,
      0,
      `${wrong.length} mismatched: ${wrong.slice(0, 3).map((w) => w.address).join(", ")}`,
    );
  });

  test("live: avatars come back as usable data URLs", () => {
    const first = avatars.find(Boolean);
    assert.ok(first, "no avatar resolved");
    assert.match(first, /^data:image\/[a-z]+;base64,/);
  });

  test("live: lazy avatars cost far less than the full address book", () => {
    assert.ok(
      avatarBytes < withAvatars.bytes,
      "on-demand avatars were not smaller than fetching every photo",
    );
  });

  // -------------------------------------------------------------------------
  console.log("\nLive incremental sync");

  const watermark = deltaWindow(messages);
  console.log(`  window kind: ${watermark.kind}`);

  test("live: messages carry row ids, so sync can use a row-id window", () => {
    assert.equal(
      watermark.kind,
      "rowId",
      "server did not return ROWID on messages; sync falls back to timestamps",
    );
  });

  if (watermark.kind === "rowId") {
    // Ask for everything after a point 25 messages back and check the server
    // honours the raw-SQL `where` clause the delta sync depends on.
    const sorted = messages
      .map((m) => messageRowId(m))
      .filter((r) => r !== undefined)
      .sort((a, b) => a - b);
    const probeRowId = sorted[Math.max(0, sorted.length - 25)];

    const started = Date.now();
    const { json: deltaJson } = await api("/message/query", {
      method: "POST",
      body: {
        with: ["chats", "chats.participants", "attributedBody", "handle"],
        where: [
          {
            statement: "message.ROWID > :startRowId",
            args: { startRowId: probeRowId },
          },
        ],
        sort: "DESC",
        offset: 0,
        limit: 500,
      },
    });
    const delta = deltaJson.data ?? [];
    console.log(
      `  delta since ROWID ${probeRowId}: ${delta.length} messages in ${Date.now() - started}ms`,
    );

    test("live: the ROWID where-clause is honoured by the server", () => {
      assert.ok(delta.length > 0, "delta query returned nothing");
      const violating = delta.filter((m) => (messageRowId(m) ?? 0) <= probeRowId);
      assert.equal(
        violating.length,
        0,
        `${violating.length} messages came back at or below the watermark — ` +
          "the where clause was ignored, which would make sync refetch everything",
      );
    });

    test("live: a delta is far smaller than a full window", () => {
      assert.ok(
        delta.length < messages.length,
        `delta (${delta.length}) was not smaller than the full window (${messages.length})`,
      );
    });
  }
} else {
  console.log(
    "\nLive server: skipped — set BB_PASSWORD in .env.local to include live checks",
  );
}

console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} check(s) failed.\n`);
process.exit(failures === 0 ? 0 : 1);
