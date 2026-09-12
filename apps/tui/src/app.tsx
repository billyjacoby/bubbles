import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import {
  buildContactIndex,
  chatService,
  chatTitle,
  connectSocket,
  conversationChat,
  deriveConversations,
  deltaWindow,
  formatTime,
  getChatMessages,
  getContacts,
  getServerInfo,
  lookupContact,
  messageService,
  messageText,
  queryMessagesSinceRowId,
  queryRecentMessages,
  resolveSendMethod,
  sendText,
  type Connection,
  type ContactIndex,
  type Conversation,
  type Message,
} from "@bubbles/shared";
import { emptyCache, saveCache, type TuiCache } from "./cache.js";

const BLUE = "#5b8def";
const GREEN = "#34c759";
const MUTED = "#727a84";
const CONTACT_CACHE_TTL = 24 * 60 * 60 * 1000;
const PARTICIPANT_COLORS = [
  "#6fd3c8",
  "#f38ba8",
  "#f9c97c",
  "#c6a0f6",
  "#91d7e3",
  "#a6da95",
] as const;

function clip(value: string, width: number): string {
  if (width <= 0) return "";
  if (value.length <= width) return value;
  if (width === 1) return "…";
  return `${value.slice(0, width - 1)}…`;
}

function displayText(message: Message): string {
  const text = messageText(message);
  if (text) return text.replace(/\s+/g, " ");
  if (message.hasAttachments) return "[attachment]";
  return "[empty message]";
}

function colorForName(name: string): string {
  let hash = 0;
  for (const character of name) {
    hash = (hash * 31 + character.codePointAt(0)!) >>> 0;
  }
  return PARTICIPANT_COLORS[hash % PARTICIPANT_COLORS.length];
}

function mergeFeed(current: Message[], incoming: Message[]): Message[] {
  const byGuid = new Map(current.map((message) => [message.guid, message]));
  for (const message of incoming) {
    const previous = byGuid.get(message.guid);
    byGuid.set(message.guid, {
      ...previous,
      ...message,
      chats: message.chats?.length ? message.chats : previous?.chats,
    });
  }
  return [...byGuid.values()]
    .sort((a, b) => (b.dateCreated ?? 0) - (a.dateCreated ?? 0))
    .slice(0, 750);
}

export function App({
  connection,
  initialCache,
}: {
  connection: Connection;
  initialCache?: TuiCache;
}) {
  const { exit } = useApp();
  const initialCacheRef = useRef(initialCache ?? emptyCache());
  const startingCache = initialCacheRef.current;
  const cacheRef = useRef(startingCache);
  const feedRef = useRef(startingCache.feed);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const selectedGuidRef = useRef<string | undefined>(undefined);
  const refreshingRef = useRef(false);
  const startingConversationsRef = useRef(
    deriveConversations(startingCache.feed),
  );
  const [conversations, setConversations] = useState<Conversation[]>(
    startingConversationsRef.current,
  );
  const [selectedGuid, setSelectedGuid] = useState<string | undefined>(
    startingConversationsRef.current[0]?.chat.guid,
  );
  const [messages, setMessages] = useState<Message[]>([]);
  const [contacts, setContacts] = useState<ContactIndex>(() =>
    buildContactIndex(startingCache.contacts),
  );
  const [privateApi, setPrivateApi] = useState(false);
  const [draft, setDraft] = useState("");
  const [composing, setComposing] = useState(false);
  const [busy, setBusy] = useState(startingCache.feed.length === 0);
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState(
    startingCache.feed.length > 0 ? "cached · syncing…" : "connecting…",
  );

  const resolveName = useCallback(
    (address: string) => lookupContact(contacts, address)?.name,
    [contacts],
  );

  const selected = Math.max(
    0,
    conversations.findIndex((conversation) => conversation.chat.guid === selectedGuid),
  );
  const selectedConversation = conversations.find(
    (conversation) => conversation.chat.guid === selectedGuid,
  );
  const selectedChat = selectedConversation
    ? conversationChat(selectedConversation)
    : undefined;
  selectedGuidRef.current = selectedChat?.guid;

  const updateCache = useCallback(
    (update: (current: TuiCache) => TuiCache) => {
      const next = update(cacheRef.current);
      cacheRef.current = next;
      saveQueueRef.current = saveQueueRef.current
        .catch(() => undefined)
        .then(() => saveCache(connection, next))
        .catch(() => undefined);
    },
    [connection],
  );

  const acceptFeed = useCallback(
    (incoming: Message[], replace = false) => {
      const next = replace
        ? [...incoming]
            .sort((a, b) => (b.dateCreated ?? 0) - (a.dateCreated ?? 0))
            .slice(0, 750)
        : mergeFeed(feedRef.current, incoming);
      feedRef.current = next;
      setConversations(deriveConversations(next));
      updateCache((cache) => ({ ...cache, feed: next }));
    },
    [updateCache],
  );

  const loadConversations = useCallback(async (forceFull = false) => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    try {
      const window = forceFull ? { kind: "none" as const } : deltaWindow(feedRef.current);
      let incoming: Message[] = [];
      const replace = forceFull || window.kind === "none";

      if (window.kind === "rowId") {
        let offset = 0;
        let page: Message[];
        do {
          page = await queryMessagesSinceRowId(connection, window.startRowId, {
            offset,
            limit: 500,
          });
          incoming.push(...page);
          offset += page.length;
        } while (page.length === 500 && offset < 5000);
      } else if (window.kind === "timestamp") {
        incoming = await queryRecentMessages(connection, {
          after: window.after,
          limit: 750,
        });
      } else {
        incoming = await queryRecentMessages(connection, { limit: 750 });
      }

      acceptFeed(incoming, replace);
      setStatus(incoming.length > 0 ? `synced · ${incoming.length} new` : "up to date");
    } catch (error) {
      setStatus(
        feedRef.current.length > 0
          ? "cached · refresh failed"
          : error instanceof Error
            ? error.message
            : "refresh failed",
      );
    } finally {
      setBusy(false);
      refreshingRef.current = false;
    }
  }, [acceptFeed, connection]);

  const loadThread = useCallback(
    async (guid: string) => {
      try {
        const next = await getChatMessages(connection, guid, { limit: 100 });
        const sorted = [...next].sort(
          (a, b) => (a.dateCreated ?? 0) - (b.dateCreated ?? 0),
        );
        if (selectedGuidRef.current === guid) setMessages(sorted);
        updateCache((cache) => {
          const retained = Object.fromEntries(
            Object.entries(cache.threads)
              .filter(([key]) => key !== guid)
              .slice(-29),
          );
          return { ...cache, threads: { ...retained, [guid]: sorted } };
        });
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "thread failed");
      }
    },
    [connection, updateCache],
  );

  useEffect(() => {
    void loadConversations();
    if (
      startingCache.contacts.length === 0 ||
      Date.now() - startingCache.contactsUpdatedAt > CONTACT_CACHE_TTL
    ) {
      void getContacts(connection)
        .then((items) => {
          setContacts(buildContactIndex(items));
          updateCache((cache) => ({
            ...cache,
            contacts: items,
            contactsUpdatedAt: Date.now(),
          }));
        })
        .catch(() => undefined);
    }
    void getServerInfo(connection)
      .then((info) => setPrivateApi(Boolean(info.private_api && info.helper_connected)))
      .catch(() => undefined);
  }, [connection, loadConversations, updateCache]);

  useEffect(() => {
    if (conversations.length === 0) {
      if (selectedGuid) setSelectedGuid(undefined);
      return;
    }
    if (!selectedGuid || !conversations.some(({ chat }) => chat.guid === selectedGuid)) {
      setSelectedGuid(conversations[0].chat.guid);
    }
  }, [conversations, selectedGuid]);

  useEffect(() => {
    if (selectedChat) {
      setMessages(cacheRef.current.threads[selectedChat.guid] ?? []);
      void loadThread(selectedChat.guid);
    } else setMessages([]);
  }, [loadThread, selectedChat?.guid]);

  useEffect(() => {
    const activeGuid = selectedChat?.guid;
    const socket = connectSocket(connection, {
      onConnectionChange: setConnected,
      onNewMessage: (message) => {
        acceptFeed([message]);
        if (activeGuid && message.chats?.some((chat) => chat.guid === activeGuid)) {
          void loadThread(activeGuid);
        }
      },
      onUpdatedMessage: (message) => {
        acceptFeed([message]);
        if (activeGuid && message.chats?.some((chat) => chat.guid === activeGuid)) {
          void loadThread(activeGuid);
        }
      },
      onChatsChanged: () => void loadConversations(true),
    });
    return () => {
      socket.disconnect();
    };
  }, [acceptFeed, connection, loadConversations, loadThread, selectedChat?.guid]);

  const send = useCallback(async () => {
    const body = draft.trim();
    if (!body || !selectedChat) return;
    setDraft("");
    setStatus("sending…");
    try {
      await sendText(connection, {
        chatGuid: selectedChat.guid,
        message: body,
        method: resolveSendMethod({}, privateApi),
      });
      await Promise.all([loadThread(selectedChat.guid), loadConversations()]);
      setStatus("sent");
    } catch (error) {
      setDraft(body);
      setStatus(error instanceof Error ? error.message : "send failed");
    }
  }, [connection, draft, loadConversations, loadThread, privateApi, selectedChat]);

  useInput((input, key) => {
    if (key.ctrl && input === "c") return exit();

    if (composing) {
      if (key.escape) return setComposing(false);
      if (key.return) return void send();
      if (key.backspace || key.delete) {
        return setDraft((value) => Array.from(value).slice(0, -1).join(""));
      }
      if (!key.ctrl && !key.meta && input && !/\p{C}/u.test(input)) {
        setDraft((value) => value + input);
      }
      return;
    }

    if (input === "q") return exit();
    if (input === "r") return void loadConversations(true);
    if (key.downArrow || input === "j") {
      const next = Math.min(Math.max(0, conversations.length - 1), selected + 1);
      return setSelectedGuid(conversations[next]?.chat.guid);
    }
    if (key.upArrow || input === "k") {
      const next = Math.max(0, selected - 1);
      return setSelectedGuid(conversations[next]?.chat.guid);
    }
    if ((key.return || key.tab || input === "i") && selectedChat) {
      setComposing(true);
    }
  });

  const columns = process.stdout.columns ?? 100;
  const rows = process.stdout.rows ?? 30;
  const sidebarWidth = Math.max(32, Math.min(52, Math.floor(columns * 0.38)));
  const bodyHeight = Math.max(8, rows - 6);
  const visibleChats = Math.max(3, bodyHeight - 3);
  const chatStart = Math.max(
    0,
    Math.min(selected - Math.floor(visibleChats / 2), conversations.length - visibleChats),
  );
  const visibleMessages = useMemo(
    () => messages.slice(-Math.max(3, Math.floor((bodyHeight - 2) / 2))),
    [bodyHeight, messages],
  );
  const service = selectedChat ? chatService(selectedChat) : null;
  const accent = service === "SMS" ? GREEN : BLUE;

  return (
    <Box flexDirection="column" height={rows}>
      <Box paddingX={1} justifyContent="space-between">
        <Text bold color="#82fb9c">BUBBLES</Text>
        <Text color={connected ? GREEN : "yellow"}>
          {clip(`${connected ? "● live" : "○ offline"} · ${status}`, Math.max(10, columns - 12))}
        </Text>
      </Box>

      <Box height={bodyHeight}>
        <Box
          width={sidebarWidth}
          flexShrink={0}
          flexDirection="column"
          borderStyle="single"
          borderColor={composing ? MUTED : "cyan"}
          paddingX={1}
        >
          <Text bold>conversations {busy ? "…" : `(${conversations.length})`}</Text>
          {conversations.slice(chatStart, chatStart + visibleChats).map((item) => {
            const chat = conversationChat(item);
            const active = chat.guid === selectedGuid;
            const label = chatTitle(chat, resolveName);
            return (
              <Text key={chat.guid} bold={active} color={active ? accent : undefined}>
                {active ? "› " : "  "}{clip(label, sidebarWidth - 6)}
              </Text>
            );
          })}
        </Box>

        <Box
          flexGrow={1}
          flexDirection="column"
          borderStyle="single"
          borderColor={composing ? accent : MUTED}
          paddingX={1}
        >
          <Box justifyContent="space-between">
            <Text bold color={accent}>{selectedChat ? chatTitle(selectedChat, resolveName) : "No conversation"}</Text>
            <Text color={accent}>{service ?? ""}</Text>
          </Box>
          <Box flexDirection="column" flexGrow={1} justifyContent="flex-end">
            {visibleMessages.map((message) => {
              const outgoing = message.isFromMe;
              const messageAccent = messageService(message) === "SMS" ? GREEN : BLUE;
              const sender = outgoing
                ? "YOU"
                : message.handle
                  ? resolveName(message.handle.address) ?? message.handle.formattedAddress ?? message.handle.address
                  : "them";
              const senderKey = outgoing ? "you" : message.handle?.address ?? sender;
              const senderColor = outgoing ? messageAccent : colorForName(senderKey);
              const time = formatTime(message.dateCreated).padStart(5);
              return (
                <Box key={message.guid} flexDirection="column">
                  <Box>
                    <Text color={MUTED}>{time} </Text>
                    <Text bold color={senderColor}>● {sender}</Text>
                    <Text color={senderColor}> {outgoing ? "›" : "‹"}</Text>
                  </Box>
                  <Box>
                    <Text color={senderColor}>      │ </Text>
                    <Text>{displayText(message)}</Text>
                  </Box>
                </Box>
              );
            })}
          </Box>
        </Box>
      </Box>

      <Box borderStyle="single" borderColor={composing ? accent : MUTED} paddingX={1}>
        <Text color={accent}>{composing ? `${service ?? "message"}> ` : "press enter to compose › "}</Text>
        <Text>{draft}</Text>
        {composing && <Text inverse> </Text>}
      </Box>
      <Text color={MUTED}> ↑↓/jk select · enter compose · r refresh · q quit</Text>
    </Box>
  );
}
