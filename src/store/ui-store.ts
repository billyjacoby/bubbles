"use client";

import { create } from "zustand";

interface UiState {
  socketConnected: boolean;
  /** Chat GUIDs the other party is currently typing in. */
  typingChats: Set<string>;
  /**
   * Authoritative unread state, keyed by chat GUID.
   *
   * The chat records embedded in messages carry a `hasUnreadMessage` flag, but
   * it reflects whenever that copy was serialised and goes stale immediately.
   * Anything we learn first-hand — opening a chat, a read-status event, an
   * incoming message — is recorded here and wins over the embedded value.
   */
  unread: Record<string, boolean>;
  /** Sidebar collapse, only honoured while a conversation is open. */
  sidebarCollapsed: boolean;

  setSocketConnected: (connected: boolean) => void;
  setTyping: (chatGuid: string, typing: boolean) => void;
  setUnread: (chatGuid: string, unread: boolean) => void;
  toggleSidebar: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  socketConnected: false,
  typingChats: new Set(),
  unread: {},
  sidebarCollapsed: false,

  setSocketConnected: (socketConnected) => set({ socketConnected }),

  toggleSidebar: () =>
    set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

  setTyping: (chatGuid, typing) =>
    set((state) => {
      if (state.typingChats.has(chatGuid) === typing) return state;
      // Replace the Set rather than mutating so subscribers re-render.
      const next = new Set(state.typingChats);
      if (typing) next.add(chatGuid);
      else next.delete(chatGuid);
      return { typingChats: next };
    }),

  setUnread: (chatGuid, unread) =>
    set((state) =>
      state.unread[chatGuid] === unread
        ? state
        : { unread: { ...state.unread, [chatGuid]: unread } },
    ),
}));

export function useIsTyping(chatGuid: string | null | undefined): boolean {
  return useUiStore((state) =>
    chatGuid ? state.typingChats.has(chatGuid) : false,
  );
}
