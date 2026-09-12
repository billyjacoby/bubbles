/** Centralised query keys so cache writes from socket events stay consistent. */
export const queryKeys = {
  serverInfo: ["server-info"] as const,
  /** Global newest-first message feed the sidebar is derived from. */
  conversations: ["conversations"] as const,
  chat: (guid: string) => ["chat", guid] as const,
  messages: (guid: string) => ["messages", guid] as const,
};
