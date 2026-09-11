import { DIVIDER_THRESHOLD_MS } from "@/lib/format";
import {
  isReaction,
  isSystemEvent,
  messageSortKey,
  parseAssociatedGuid,
} from "@/lib/message-utils";
import type { Message } from "@/lib/types";
import type { RenderedMessage } from "@/components/message-bubble";

export type ThreadItem =
  | { kind: "divider"; id: string; timestamp: number }
  | { kind: "system"; id: string; message: Message }
  | ({ kind: "message"; id: string } & RenderedMessage);

/**
 * Turn a flat, oldest-first message list into renderable thread items.
 *
 * Tapbacks are lifted out and attached to the bubble they target, system events
 * get their own centred row, and time dividers are inserted where a gap opens
 * up between messages.
 */
export function buildThread(messages: Message[]): ThreadItem[] {
  const sorted = [...messages].sort((a, b) => messageSortKey(a) - messageSortKey(b));

  // Pass 1: pull reactions aside, keyed by the GUID they target.
  const reactionsByTarget = new Map<string, Message[]>();
  const body: Message[] = [];

  for (const message of sorted) {
    if (isReaction(message)) {
      const { guid } = parseAssociatedGuid(message.associatedMessageGuid);
      if (guid) {
        const list = reactionsByTarget.get(guid) ?? [];
        list.push(message);
        reactionsByTarget.set(guid, list);
      }
      continue;
    }
    body.push(message);
  }

  const byGuid = new Map(body.map((m) => [m.guid, m]));

  // Pass 2: build the render list.
  const items: ThreadItem[] = [];
  let previous: Message | undefined;

  for (let i = 0; i < body.length; i += 1) {
    const message = body[i];
    const timestamp = message.dateCreated ?? 0;

    const gap = timestamp - (previous?.dateCreated ?? 0);
    if (!previous || gap > DIVIDER_THRESHOLD_MS) {
      items.push({
        kind: "divider",
        id: `divider-${message.guid}`,
        timestamp,
      });
    }

    if (isSystemEvent(message)) {
      items.push({ kind: "system", id: message.guid, message });
      previous = message;
      continue;
    }

    const next = body[i + 1];
    // A "run" is consecutive messages from the same side; only the first shows
    // the sender name and only the last gets the tail corner.
    const samePrevSender =
      previous &&
      !isSystemEvent(previous) &&
      previous.isFromMe === message.isFromMe &&
      previous.handleId === message.handleId;
    const sameNextSender =
      next &&
      !isSystemEvent(next) &&
      next.isFromMe === message.isFromMe &&
      next.handleId === message.handleId;

    const { guid: replyGuid } = parseAssociatedGuid(message.threadOriginatorGuid);

    items.push({
      kind: "message",
      id: message.guid,
      message,
      reactions: reactionsByTarget.get(message.guid) ?? [],
      replyTo: replyGuid ? byGuid.get(replyGuid) : undefined,
      showSender: !samePrevSender,
      isTail: !sameNextSender,
    });

    previous = message;
  }

  return items;
}
