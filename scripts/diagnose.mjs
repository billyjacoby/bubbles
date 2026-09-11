#!/usr/bin/env node
/**
 * Diagnose chat/message sync against a BlueBubbles server.
 *
 * Usage:
 *   node scripts/diagnose.mjs --url https://your-server --password YOUR_PASSWORD
 *   BB_URL=... BB_PASSWORD=... node scripts/diagnose.mjs
 *
 * Read-only: every request is a GET or a query POST. Nothing is sent, changed
 * or deleted.
 */

const args = process.argv.slice(2);
function arg(name) {
  const i = args.indexOf(`--${name}`);
  return i !== -1 ? args[i + 1] : undefined;
}

const SERVER = (arg("url") ?? process.env.BB_URL ?? "").replace(/\/+$/, "");
const PASSWORD = arg("password") ?? process.env.BB_PASSWORD ?? "";

if (!SERVER || !PASSWORD) {
  console.error("Missing credentials.\n");
  console.error("  node scripts/diagnose.mjs --url https://server --password PW");
  console.error("  BB_URL=... BB_PASSWORD=... node scripts/diagnose.mjs");
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
    signal: AbortSignal.timeout(30_000),
  });

  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`${path}: non-JSON response (status ${res.status}): ${text.slice(0, 200)}`);
  }
  if (res.status !== 200) {
    throw new Error(`${path}: status ${res.status}: ${json?.error?.message ?? json?.message ?? ""}`);
  }
  return json;
}

const ts = (ms) => (ms ? new Date(ms).toLocaleString() : "—");
const startOfToday = new Date().setHours(0, 0, 0, 0);
const sevenDaysAgo = Date.now() - 7 * 86_400_000;

function heading(title) {
  console.log(`\n${"=".repeat(70)}\n${title}\n${"=".repeat(70)}`);
}

function chatLabel(chat) {
  return (
    chat.displayName?.trim() ||
    chat.participants?.map((p) => p.address).join(", ") ||
    chat.chatIdentifier ||
    chat.guid
  );
}

async function main() {
  heading("1. Server");

  const info = await api("/server/info");
  const d = info.data ?? {};
  console.log(`server_version : ${d.server_version}`);
  console.log(`os_version     : ${d.os_version}`);
  console.log(`private_api    : ${d.private_api}`);
  console.log(`helper_connected: ${d.helper_connected}`);
  console.log(`proxy_service  : ${d.proxy_service}`);

  heading("2. Does the server have today's messages at all?");

  const totalMessages = await api("/message/count");
  const todayMessages = await api("/message/count", { query: { after: startOfToday } });
  const weekMessages = await api("/message/count", { query: { after: sevenDaysAgo } });

  console.log(`total messages      : ${totalMessages.data?.total}`);
  console.log(`since 7 days ago    : ${weekMessages.data?.total}`);
  console.log(`since midnight today: ${todayMessages.data?.total}`);

  if (!todayMessages.data?.total) {
    console.log(
      "\n  >> The server itself reports NO messages today. This is a server-side\n" +
        "     ingestion problem, not a client one. Check Full Disk Access for the\n" +
        "     BlueBubbles server app and that it can read chat.db.",
    );
  }

  heading("3. How many chats exist?");

  const chatCount = await api("/chat/count");
  const total = chatCount.data?.total;
  console.log(`total chats: ${total}`);
  if (total > 200) {
    console.log(
      "  >> More than our client's 200-chat page size. If sorting is broken,\n" +
        "     recent chats can fall outside the first page entirely.",
    );
  }

  heading("4. Does `sort: lastmessage` actually work?");

  // Try both spellings of the `with` option — the reference client is
  // inconsistent about it and the server may only honour one.
  for (const withOption of ["lastmessage", "lastMessage"]) {
    const res = await api("/chat/query", {
      method: "POST",
      body: { with: [withOption, "participants"], offset: 0, limit: 10, sort: "lastmessage" },
    });

    const chats = res.data ?? [];
    const dates = chats.map((c) => c.lastMessage?.dateCreated ?? 0);
    const populated = dates.filter(Boolean).length;
    const sortedDesc = dates.every((v, i) => i === 0 || dates[i - 1] >= v);

    console.log(`\nwith: "${withOption}"`);
    console.log(`  returned            : ${chats.length}`);
    console.log(`  lastMessage present : ${populated}/${chats.length}`);
    console.log(`  ordered newest-first: ${sortedDesc}`);
    console.log(`  newest lastMessage  : ${ts(Math.max(...dates))}`);
    console.log("  top 5:");
    for (const c of chats.slice(0, 5)) {
      console.log(`    ${ts(c.lastMessage?.dateCreated).padEnd(24)} ${chatLabel(c).slice(0, 40)}`);
    }
  }

  heading("5. Which chats actually received messages today?");

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

  const messages = recent.data ?? [];
  console.log(`messages returned since midnight: ${messages.length}`);

  const activeToday = new Map();
  for (const m of messages) {
    const chat = m.chats?.[0];
    if (!chat) continue;
    if (!activeToday.has(chat.guid)) activeToday.set(chat.guid, { chat, count: 0, newest: 0 });
    const entry = activeToday.get(chat.guid);
    entry.count += 1;
    entry.newest = Math.max(entry.newest, m.dateCreated ?? 0);
  }

  console.log(`distinct chats active today    : ${activeToday.size}\n`);
  for (const { chat, count, newest } of activeToday.values()) {
    console.log(`  ${ts(newest).padEnd(24)} ${String(count).padStart(3)} msg  ${chatLabel(chat).slice(0, 40)}`);
  }

  heading("6. Do those chats appear in the chat list our client builds?");

  // Reproduce exactly what the app requests today.
  const listed = await api("/chat/query", {
    method: "POST",
    body: { with: ["lastMessage", "participants"], offset: 0, limit: 200, sort: "lastmessage" },
  });
  const listedChats = listed.data ?? [];
  const listedGuids = new Set(listedChats.map((c) => c.guid));

  console.log(`chats returned by our query: ${listedChats.length}`);

  const missing = [];
  const staleLastMessage = [];

  for (const [guid, { chat, newest }] of activeToday) {
    if (!listedGuids.has(guid)) {
      missing.push({ chat, newest });
      continue;
    }
    const listedChat = listedChats.find((c) => c.guid === guid);
    const listedDate = listedChat?.lastMessage?.dateCreated ?? 0;
    // Allow a second of slack for clock/rounding differences.
    if (listedDate < newest - 1000) {
      staleLastMessage.push({ chat, newest, listedDate });
    }
  }

  console.log(`active-today chats MISSING from the list : ${missing.length}`);
  for (const { chat, newest } of missing) {
    console.log(`  ${ts(newest).padEnd(24)} ${chatLabel(chat).slice(0, 40)}`);
  }

  console.log(`\nactive-today chats with STALE lastMessage: ${staleLastMessage.length}`);
  for (const { chat, newest, listedDate } of staleLastMessage) {
    console.log(
      `  real ${ts(newest).padEnd(22)} list shows ${ts(listedDate).padEnd(22)} ${chatLabel(chat).slice(0, 32)}`,
    );
  }

  heading("Verdict");

  if (!todayMessages.data?.total) {
    console.log("Server has no messages today -> SERVER-SIDE ingestion issue.");
  } else if (missing.length > 0) {
    console.log(
      "Server HAS today's messages, but chats that received them are absent from\n" +
        "/chat/query -> the chat-list query (sort/paging) is at fault. Fixable in\n" +
        "our client.",
    );
  } else if (staleLastMessage.length > 0) {
    console.log(
      "Chats are present but their `lastMessage` is stale -> the preview and\n" +
        "ordering cannot be trusted. Our client must derive recency another way.",
    );
  } else {
    console.log(
      "The chat list looks correct from the API's side. The problem is likely in\n" +
        "how our client renders or sorts the result — send this output over.",
    );
  }
}

main().catch((err) => {
  console.error(`\nDiagnostic failed: ${err.message}`);
  process.exit(1);
});
