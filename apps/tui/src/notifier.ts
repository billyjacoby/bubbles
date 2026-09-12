#!/usr/bin/env node
import { spawn } from "node:child_process";
import {
  buildContactIndex,
  chatTitle,
  connectSocket,
  deltaWindow,
  deriveConversations,
  getContacts,
  isReaction,
  lookupContact,
  messageText,
  queryMessagesSinceRowId,
  queryRecentMessages,
  type Message,
} from "@bubbles/shared";
import { loadCache } from "./cache.js";
import { loadConnection } from "./config.js";

const POLL_INTERVAL = 10_000;

function mergeFeed(current: Message[], incoming: Message[]): Message[] {
  const byGuid = new Map(current.map((message) => [message.guid, message]));
  for (const message of incoming) {
    byGuid.set(message.guid, { ...byGuid.get(message.guid), ...message });
  }
  return [...byGuid.values()]
    .sort((a, b) => (b.dateCreated ?? 0) - (a.dateCreated ?? 0))
    .slice(0, 750);
}

function notificationBody(message: Message): string {
  const text = messageText(message).replace(/\s+/g, " ").trim();
  if (text) return text;
  if (message.hasAttachments) return "Attachment";
  return "New message";
}

function launchNotification(title: string, body: string): void {
  const customCommand = process.env.BUBBLES_NOTIFICATION_COMMAND?.trim();
  let command: string;
  let args: string[];

  if (customCommand) {
    command = customCommand;
    args = [title, body];
  } else if (process.platform === "linux") {
    command = "notify-send";
    args = ["--app-name", "Bubbles", "--", title, body];
  } else if (process.platform === "darwin") {
    command = "osascript";
    args = [
      "-e",
      "on run argv",
      "-e",
      "display notification (item 2 of argv) with title (item 1 of argv)",
      "-e",
      "end run",
      title,
      body,
    ];
  } else {
    process.stdout.write(`${title}: ${body}\n`);
    return;
  }

  const child = spawn(command, args, { detached: true, stdio: "ignore" });
  child.on("error", (error) => {
    process.stderr.write(`Notification failed: ${error.message}\n`);
  });
  child.unref();
}

const connection = await loadConnection();
if (!connection) {
  process.stderr.write("Bubbles is not configured. Run bubbles-tui --setup first.\n");
  process.exit(1);
}

const cache = await loadCache(connection);
let contacts = buildContactIndex(cache?.contacts ?? []);
let syncedFeed = await queryRecentMessages(connection, { limit: 750 });
let feed = syncedFeed;
const seen = new Set(syncedFeed.map((message) => message.guid));

if ((cache?.contacts.length ?? 0) === 0) {
  void getContacts(connection)
    .then((items) => {
      contacts = buildContactIndex(items);
    })
    .catch(() => undefined);
}

const accept = (message: Message, notify: boolean) => {
  const isNew = !seen.has(message.guid);
  seen.add(message.guid);
  feed = mergeFeed(feed, [message]);
  if (!notify || !isNew || message.isFromMe || isReaction(message)) return;

  const resolveName = (address: string) => lookupContact(contacts, address)?.name;
  const chat = message.chats?.[0];
  const sender = message.handle
    ? resolveName(message.handle.address) ??
      message.handle.formattedAddress ??
      message.handle.address
    : "New message";
  const hydratedChat = chat?.guid
    ? deriveConversations(feed).find((conversation) => conversation.chat.guid === chat.guid)
        ?.chat ?? chat
    : chat;
  const title = hydratedChat ? chatTitle(hydratedChat, resolveName) : sender;
  launchNotification(title, notificationBody(message));
};

let polling = false;
const poll = async () => {
  if (polling) return;
  polling = true;
  try {
    const window = deltaWindow(syncedFeed);
    const incoming =
      window.kind === "rowId"
        ? await queryMessagesSinceRowId(connection, window.startRowId, { limit: 500 })
        : await queryRecentMessages(connection, {
            after: window.kind === "timestamp" ? window.after : undefined,
            limit: 750,
          });
    syncedFeed = mergeFeed(syncedFeed, incoming);
    for (const message of [...incoming].reverse()) accept(message, true);
  } catch (error) {
    process.stderr.write(
      `Message sync failed: ${error instanceof Error ? error.message : "unknown error"}\n`,
    );
  } finally {
    polling = false;
  }
};

const socket = connectSocket(connection, {
  onConnectionChange: (connected) => {
    process.stdout.write(connected ? "Connected\n" : "Disconnected\n");
    if (connected) void poll();
  },
  onNewMessage: (message) => accept(message, true),
  onUpdatedMessage: (message) => accept(message, false),
});

const timer = setInterval(() => void poll(), POLL_INTERVAL);
const stop = () => {
  clearInterval(timer);
  socket.disconnect();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
