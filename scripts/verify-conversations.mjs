#!/usr/bin/env node
/**
 * Exercise the real deriveConversations implementation.
 *
 * Runs fixture assertions always, and additionally replays live server data
 * through the same code path when credentials are supplied:
 *
 *   node scripts/verify-conversations.mjs
 *   node scripts/verify-conversations.mjs --url https://server --password PW
 */

import assert from "node:assert/strict";
import { deriveConversations, conversationChat } from "../src/lib/conversations.ts";
import { chatTitle, chatPreview } from "../src/lib/message-utils.ts";
import {
  buildContactIndex,
  lookupContact,
  addressKeys,
  initialsFor,
} from "../src/lib/contacts.ts";

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

// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const arg = (n) => {
  const i = args.indexOf(`--${n}`);
  return i !== -1 ? args[i + 1] : undefined;
};
const SERVER = (arg("url") ?? process.env.BB_URL ?? "").replace(/\/+$/, "");
const PASSWORD = arg("password") ?? process.env.BB_PASSWORD ?? "";

if (SERVER && PASSWORD) {
  const origin = new URL(
    /^https?:\/\//.test(SERVER) ? SERVER : `https://${SERVER}`,
  ).origin;

  console.log("\nLive server");

  const url = new URL(`${origin}/api/v1/message/query`);
  url.searchParams.set("guid", PASSWORD);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "ngrok-skip-browser-warning": "true",
      skip_zrok_interstitial: "true",
    },
    body: JSON.stringify({
      with: ["chats", "chats.participants", "attributedBody", "handle"],
      sort: "DESC",
      offset: 0,
      limit: 1000,
      after: null,
      before: null,
    }),
    signal: AbortSignal.timeout(60_000),
  });

  const json = JSON.parse(await res.text());
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
    const u = new URL(`${origin}/api/v1/contact`);
    u.searchParams.set("guid", PASSWORD);
    if (withAvatars) u.searchParams.set("extraProperties", "avatar");
    const started = Date.now();
    const r = await fetch(u, {
      headers: {
        "ngrok-skip-browser-warning": "true",
        skip_zrok_interstitial: "true",
      },
      signal: AbortSignal.timeout(120_000),
    });
    const body = await r.text();
    return {
      contacts: JSON.parse(body).data ?? [],
      bytes: body.length,
      ms: Date.now() - started,
    };
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
} else {
  console.log("\nLive server: skipped (pass --url and --password to include)");
}

console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} check(s) failed.\n`);
process.exit(failures === 0 ? 0 : 1);
