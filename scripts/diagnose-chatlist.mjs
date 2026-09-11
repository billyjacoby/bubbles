#!/usr/bin/env node
/**
 * Follow-up diagnostic: why are recently-active chats absent from the
 * `sort: lastmessage` chat list, and is a message-derived list better?
 *
 * Usage:
 *   node scripts/diagnose-chatlist.mjs --url https://server --password PW
 *
 * Read-only.
 */

const args = process.argv.slice(2);
const arg = (n) => {
  const i = args.indexOf(`--${n}`);
  return i !== -1 ? args[i + 1] : undefined;
};

const SERVER = (arg("url") ?? process.env.BB_URL ?? "").replace(/\/+$/, "");
const PASSWORD = arg("password") ?? process.env.BB_PASSWORD ?? "";

if (!SERVER || !PASSWORD) {
  console.error("node scripts/diagnose-chatlist.mjs --url https://server --password PW");
  process.exit(1);
}

const origin = new URL(/^https?:\/\//.test(SERVER) ? SERVER : `https://${SERVER}`).origin;

async function api(path, { method = "GET", query = {}, body } = {}) {
  const url = new URL(`${origin}/api/v1${path}`);
  url.searchParams.set("guid", PASSWORD);
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }
  const res = await fetch(url, {
    method,
    headers: {
      "ngrok-skip-browser-warning": "true",
      skip_zrok_interstitial: "true",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(60_000),
  });
  const json = JSON.parse(await res.text());
  if (res.status !== 200) throw new Error(`${path}: ${res.status}`);
  return json;
}

const ts = (ms) => (ms ? new Date(ms).toLocaleString() : "—");
const startOfToday = new Date().setHours(0, 0, 0, 0);
const label = (c) =>
  c.displayName?.trim() ||
  c.participants?.map((p) => p.address).join(", ") ||
  c.chatIdentifier ||
  c.guid;

const heading = (t) => console.log(`\n${"=".repeat(70)}\n${t}\n${"=".repeat(70)}`);

async function main() {
  heading("A. Find today's active chats across ALL chat/query pages");

  const recent = await api("/message/query", {
    method: "POST",
    body: {
      with: ["chats", "chats.participants"],
      after: startOfToday,
      sort: "DESC",
      offset: 0,
      limit: 100,
    },
  });

  const targets = new Map();
  for (const m of recent.data ?? []) {
    const chat = m.chats?.[0];
    if (chat && !targets.has(chat.guid)) targets.set(chat.guid, chat);
  }
  console.log(`looking for ${targets.size} chats active today`);

  const PAGE = 500;
  const found = new Map();
  let index = 0;
  let totalWithLastMessage = 0;
  let totalScanned = 0;

  for (let offset = 0; ; offset += PAGE) {
    const page = await api("/chat/query", {
      method: "POST",
      body: { with: ["lastmessage"], offset, limit: PAGE, sort: "lastmessage" },
    });
    const chats = page.data ?? [];
    if (chats.length === 0) break;

    for (const c of chats) {
      if (c.lastMessage?.dateCreated) totalWithLastMessage += 1;
      totalScanned += 1;
      if (targets.has(c.guid) && !found.has(c.guid)) {
        found.set(c.guid, { chat: c, index });
      }
      index += 1;
    }

    if (chats.length < PAGE) break;
  }

  console.log(`scanned ${totalScanned} chats total`);
  console.log(
    `chats with a populated lastMessage: ${totalWithLastMessage}/${totalScanned} ` +
      `(${((totalWithLastMessage / totalScanned) * 100).toFixed(1)}%)`,
  );

  console.log("\nWhere today's chats actually sit in the sorted list:");
  for (const [guid, chat] of targets) {
    const hit = found.get(guid);
    if (!hit) {
      console.log(`  NOT FOUND ANYWHERE            ${label(chat).slice(0, 40)}`);
    } else {
      console.log(
        `  index ${String(hit.index).padStart(5)} of ${totalScanned}` +
          `  lastMessage=${ts(hit.chat.lastMessage?.dateCreated).padEnd(24)} ${label(chat).slice(0, 36)}`,
      );
    }
  }

  heading("B. Is the sort globally monotonic, or only locally?");

  const firstPage = await api("/chat/query", {
    method: "POST",
    body: { with: ["lastmessage"], offset: 0, limit: 50, sort: "lastmessage" },
  });
  const dates = (firstPage.data ?? []).map((c) => c.lastMessage?.dateCreated ?? 0);
  const nulls = dates.filter((d) => !d).length;
  const firstNullAt = dates.findIndex((d) => !d);
  const datedAfterNull = firstNullAt !== -1 && dates.slice(firstNullAt).some(Boolean);

  console.log(`first 50: ${nulls} have no lastMessage`);
  console.log(`first null-lastMessage appears at index: ${firstNullAt}`);
  console.log(
    `dated chats appear AFTER a null one: ${datedAfterNull}` +
      (datedAfterNull ? "  <-- ordering is not trustworthy" : ""),
  );

  heading("C. Message-derived chat list (proposed replacement)");

  // Pull the most recent messages across all chats and derive conversation
  // ordering from them directly, bypassing the broken lastmessage join.
  const LIMIT = 1000;
  const t0 = Date.now();
  const feed = await api("/message/query", {
    method: "POST",
    body: {
      with: ["chats", "chats.participants", "handle", "attributedBody"],
      sort: "DESC",
      offset: 0,
      limit: LIMIT,
    },
  });
  const elapsed = Date.now() - t0;

  const msgs = feed.data ?? [];
  const derived = new Map();
  for (const m of msgs) {
    const chat = m.chats?.[0];
    if (!chat) continue;
    if (!derived.has(chat.guid)) derived.set(chat.guid, { chat, last: m });
  }

  console.log(`fetched ${msgs.length} messages in ${elapsed}ms`);
  console.log(`distinct chats derived: ${derived.size}`);
  console.log(`oldest message in window: ${ts(msgs[msgs.length - 1]?.dateCreated)}`);

  console.log("\ntop 15 by true recency:");
  let n = 0;
  for (const { chat, last } of derived.values()) {
    if (n++ >= 15) break;
    const text = (last.attributedBody?.[0]?.string ?? last.text ?? "").replace(/\uFFFC/g, "").trim();
    console.log(
      `  ${ts(last.dateCreated).padEnd(24)} ${label(chat).slice(0, 30).padEnd(30)} ${text.slice(0, 30)}`,
    );
  }

  const derivedHasToday = [...targets.keys()].filter((g) => derived.has(g));
  console.log(
    `\ntoday's chats present in derived list: ${derivedHasToday.length}/${targets.size}`,
  );

  heading("Verdict");
  if (derivedHasToday.length === targets.size) {
    console.log(
      "The message-derived list surfaces today's chats correctly while\n" +
        "/chat/query does not. Build the chat list from /message/query.",
    );
  } else {
    console.log("Message-derived list also misses some chats — needs more digging.");
  }
}

main().catch((e) => {
  console.error(`\nFailed: ${e.message}`);
  process.exit(1);
});
