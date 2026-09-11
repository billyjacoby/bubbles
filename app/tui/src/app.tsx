import { useCallback, useEffect, useMemo, useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import {
  buildContactIndex,
  chatPreview,
  chatService,
  chatTitle,
  connectSocket,
  conversationChat,
  deriveConversations,
  formatListTimestamp,
  formatTime,
  getChatMessages,
  getContacts,
  getServerInfo,
  lookupContact,
  messageService,
  messageText,
  queryRecentMessages,
  resolveSendMethod,
  sendText,
  type Connection,
  type ContactIndex,
  type Conversation,
  type Message,
} from "@bubbles/shared";

const BLUE = "#5b8def";
const GREEN = "#34c759";
const MUTED = "#727a84";

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

export function App({ connection }: { connection: Connection }) {
  const { exit } = useApp();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState(0);
  const [messages, setMessages] = useState<Message[]>([]);
  const [contacts, setContacts] = useState<ContactIndex>(new Map());
  const [privateApi, setPrivateApi] = useState(false);
  const [draft, setDraft] = useState("");
  const [composing, setComposing] = useState(false);
  const [busy, setBusy] = useState(true);
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState("connecting…");

  const resolveName = useCallback(
    (address: string) => lookupContact(contacts, address)?.name,
    [contacts],
  );

  const selectedConversation = conversations[selected];
  const selectedChat = selectedConversation
    ? conversationChat(selectedConversation)
    : undefined;

  const loadConversations = useCallback(async () => {
    try {
      const feed = await queryRecentMessages(connection, { limit: 750 });
      setConversations(deriveConversations(feed));
      setStatus("synced");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "refresh failed");
    } finally {
      setBusy(false);
    }
  }, [connection]);

  const loadThread = useCallback(
    async (guid: string) => {
      try {
        const next = await getChatMessages(connection, guid, { limit: 100 });
        setMessages([...next].sort((a, b) => (a.dateCreated ?? 0) - (b.dateCreated ?? 0)));
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "thread failed");
      }
    },
    [connection],
  );

  useEffect(() => {
    void loadConversations();
    void getContacts(connection)
      .then((items) => setContacts(buildContactIndex(items)))
      .catch(() => undefined);
    void getServerInfo(connection)
      .then((info) => setPrivateApi(Boolean(info.private_api && info.helper_connected)))
      .catch(() => undefined);
  }, [connection, loadConversations]);

  useEffect(() => {
    if (selected >= conversations.length) {
      setSelected(Math.max(0, conversations.length - 1));
    }
  }, [conversations.length, selected]);

  useEffect(() => {
    if (selectedChat) void loadThread(selectedChat.guid);
    else setMessages([]);
  }, [loadThread, selectedChat?.guid]);

  useEffect(() => {
    const activeGuid = selectedChat?.guid;
    const socket = connectSocket(connection, {
      onConnectionChange: setConnected,
      onNewMessage: (message) => {
        void loadConversations();
        if (activeGuid && message.chats?.some((chat) => chat.guid === activeGuid)) {
          void loadThread(activeGuid);
        }
      },
      onUpdatedMessage: (message) => {
        if (activeGuid && message.chats?.some((chat) => chat.guid === activeGuid)) {
          void loadThread(activeGuid);
        }
      },
      onChatsChanged: () => void loadConversations(),
    });
    return () => {
      socket.disconnect();
    };
  }, [connection, loadConversations, loadThread, selectedChat?.guid]);

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
    if (input === "r") return void loadConversations();
    if (key.downArrow || input === "j") {
      return setSelected((value) =>
        Math.min(Math.max(0, conversations.length - 1), value + 1),
      );
    }
    if (key.upArrow || input === "k") {
      return setSelected((value) => Math.max(0, value - 1));
    }
    if ((key.return || key.tab || input === "i") && selectedChat) {
      setComposing(true);
    }
  });

  const columns = process.stdout.columns ?? 100;
  const rows = process.stdout.rows ?? 30;
  const sidebarWidth = Math.max(24, Math.min(42, Math.floor(columns * 0.32)));
  const bodyHeight = Math.max(8, rows - 6);
  const visibleChats = Math.max(3, bodyHeight - 2);
  const chatStart = Math.max(
    0,
    Math.min(selected - Math.floor(visibleChats / 2), conversations.length - visibleChats),
  );
  const visibleMessages = useMemo(
    () => messages.slice(-Math.max(3, bodyHeight - 2)),
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
          flexDirection="column"
          borderStyle="single"
          borderColor={composing ? MUTED : "cyan"}
          paddingX={1}
        >
          <Text bold>conversations {busy ? "…" : `(${conversations.length})`}</Text>
          {conversations.slice(chatStart, chatStart + visibleChats).map((item, offset) => {
            const index = chatStart + offset;
            const chat = conversationChat(item);
            const active = index === selected;
            const label = chatTitle(chat, resolveName);
            const timestamp = formatListTimestamp(item.activity);
            const room = sidebarWidth - timestamp.length - 7;
            return (
              <Box key={chat.guid} flexDirection="column">
                <Text bold={active} inverse={active} color={active ? accent : undefined}>
                  {active ? "› " : "  "}{clip(label, room)} {timestamp}
                </Text>
                <Text color={MUTED}>  {clip(chatPreview(chat, resolveName), sidebarWidth - 6)}</Text>
              </Box>
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
                ? "you"
                : message.handle
                  ? resolveName(message.handle.address) ?? message.handle.formattedAddress ?? message.handle.address
                  : "them";
              return (
                <Box key={message.guid} justifyContent={outgoing ? "flex-end" : "flex-start"}>
                  <Text color={outgoing ? messageAccent : undefined}>
                    {outgoing ? `${displayText(message)}  ›` : `‹ ${sender}: ${displayText(message)}`}
                    <Text color={MUTED}> {formatTime(message.dateCreated)}</Text>
                  </Text>
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
