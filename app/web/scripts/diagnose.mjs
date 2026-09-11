#!/usr/bin/env node
/**
 * Diagnose chat/message sync against a BlueBubbles server.
 *
 * Credentials come from .env.local (see .env.example), or --url/--password.
 *
 * Read-only: every request is a GET or a query POST. Nothing is sent, changed
 * or deleted.
 */

import { loadConfig, makeApi } from "./config.mjs";

const config = loadConfig();
const rawApi = makeApi(config);
const api = async (path, opts) => (await rawApi(path, opts)).json;

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

  heading("6. /chat/query vs the message-derived list");

  // The server applies `sort` after LIMIT/OFFSET, so this endpoint cannot
  // produce a globally ordered list. Kept here to confirm the defect still
  // exists rather than to drive the UI.
  const listed = await api("/chat/query", {
    method: "POST",
    body: { with: ["lastMessage", "participants"], offset: 0, limit: 200, sort: "lastmessage" },
  });
  const listedGuids = new Set((listed.data ?? []).map((c) => c.guid));
  const missingFromChatQuery = [...activeToday.keys()].filter((g) => !listedGuids.has(g));

  console.log(`/chat/query (first 200)      : ${listedGuids.size} chats`);
  console.log(`  active-today chats missing : ${missingFromChatQuery.length}`);

  // What the app actually uses: conversations derived from the message feed.
  const feed = await api("/message/query", {
    method: "POST",
    body: {
      with: ["chats", "chats.participants", "attributedBody"],
      sort: "DESC",
      offset: 0,
      limit: 1000,
    },
  });

  const derivedOrder = [];
  const seen = new Set();
  for (const m of feed.data ?? []) {
    const guid = m.chats?.[0]?.guid;
    if (!guid || seen.has(guid)) continue;
    seen.add(guid);
    derivedOrder.push(guid);
  }
  const missingFromDerived = [...activeToday.keys()].filter((g) => !seen.has(g));

  console.log(`message-derived list         : ${derivedOrder.length} conversations`);
  console.log(`  active-today chats missing : ${missingFromDerived.length}`);
  console.log(
    `  active-today chats in top ${activeToday.size} : ` +
      `${[...activeToday.keys()].filter((g) => derivedOrder.slice(0, activeToday.size).includes(g)).length}/${activeToday.size}`,
  );

  heading("Verdict");

  if (!todayMessages.data?.total) {
    console.log("Server reports no messages today -> SERVER-SIDE ingestion issue.");
  } else if (missingFromDerived.length > 0) {
    console.log(
      "Today's chats are missing from the MESSAGE-DERIVED list. This is the list\n" +
        "the app renders, so this is a real client-side bug — investigate\n" +
        "deriveConversations() and the feed window size.",
    );
  } else {
    console.log(
      "The message-derived list the app uses is correct: today's chats are\n" +
        "present and ordered.",
    );
    if (missingFromChatQuery.length > 0) {
      console.log(
        `\nNote: /chat/query still omits ${missingFromChatQuery.length} of them, as expected —\n` +
          "it sorts per page rather than globally. The app does not use it for\n" +
          "listing; see the README. This is a server defect, not a regression.",
      );
    }
  }
}

main().catch((err) => {
  console.error(`\nDiagnostic failed: ${err.message}`);
  process.exit(1);
});
