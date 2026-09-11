"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

/** Messages caps pinned conversations at nine; the grid is sized around it. */
export const MAX_PINS = 9;

interface PinState {
  /** Chat GUIDs in pin order — first is top-left of the grid. */
  pinned: string[];

  toggle: (chatGuid: string) => void;
  /** Move a pin to an absolute position, for drag-and-drop reordering. */
  reorder: (chatGuid: string, toIndex: number) => void;
}

/**
 * Pinned conversations.
 *
 * The server has no concept of this: `/chat/query` returns no `isPinned` field
 * and there is no endpoint to set one — the official client keeps pins in its
 * own local database too. So pins live here, persisted to localStorage, and are
 * per browser profile rather than per account.
 *
 * Stored as an ordered array rather than a set: order is user-controlled and
 * must not reshuffle with message activity.
 */
export const usePinStore = create<PinState>()(
  persist(
    (set) => ({
      pinned: [],

      toggle: (chatGuid) =>
        set((state) => {
          if (state.pinned.includes(chatGuid)) {
            return { pinned: state.pinned.filter((guid) => guid !== chatGuid) };
          }
          // Silently refuse past the cap; the UI disables the control and
          // explains why, so this is just a guard.
          if (state.pinned.length >= MAX_PINS) return state;
          return { pinned: [...state.pinned, chatGuid] };
        }),

      reorder: (chatGuid, toIndex) =>
        set((state) => {
          const from = state.pinned.indexOf(chatGuid);
          if (from === -1) return state;

          const clamped = Math.max(0, Math.min(toIndex, state.pinned.length - 1));
          if (from === clamped) return state;

          const next = [...state.pinned];
          next.splice(from, 1);
          next.splice(clamped, 0, chatGuid);
          return { pinned: next };
        }),
    }),
    {
      name: "bubbles-pinned-chats",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ pinned: state.pinned }),
    },
  ),
);
