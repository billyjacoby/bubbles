/**
 * BlueBubbles server data models.
 *
 * Field names mirror the JSON the BlueBubbles macOS server returns. Anything
 * marked optional is only present when the relevant `with` option was passed
 * on the request.
 */

export interface Handle {
  ROWID?: number;
  originalROWID?: number;
  address: string;
  formattedAddress?: string;
  /** "iMessage" | "SMS" */
  service?: string;
  uniqueAddrAndService?: string;
  country?: string;
  color?: string;
  defaultPhone?: string;
  defaultEmail?: string;
}

export interface Attachment {
  ROWID?: number;
  originalROWID?: number;
  guid: string;
  /** Uniform type identifier, e.g. "public.jpeg" */
  uti?: string;
  mimeType?: string | null;
  isOutgoing?: boolean;
  transferName?: string | null;
  totalBytes?: number;
  height?: number;
  width?: number;
  metadata?: Record<string, unknown> | string | null;
  hasLivePhoto?: boolean;
}

/** Attributed-body runs carry mentions, attachment placeholders and transcripts. */
export interface AttributedBodyRun {
  /** `[offset, length]` — NOT `[start, end]`. */
  range: [number, number];
  attributes?: {
    __kIMMessagePartAttributeName?: number;
    __kIMFileTransferGUIDAttributeName?: string;
    __kIMMentionConfirmedMention?: string;
    IMAudioTranscription?: string;
  };
}

export interface AttributedBody {
  string: string;
  runs: AttributedBodyRun[];
}

export interface MessageSummaryInfo {
  /** Parts the sender unsent. Server also spells this "rp". */
  retractedParts?: number[];
  rp?: number[];
  editedParts?: number[];
  editedContent?: Record<string, unknown> | unknown[];
  originalTextRange?: Record<string, number[]> | number[];
}

export interface Message {
  ROWID?: number;
  originalROWID?: number;
  guid: string;
  handleId?: number;
  otherHandle?: number;
  text?: string | null;
  subject?: string | null;
  error?: number;
  /** ms since epoch */
  dateCreated?: number | null;
  dateRead?: number | null;
  dateDelivered?: number | null;
  dateEdited?: number | null;
  dateDeleted?: number | null;
  isDelivered?: boolean;
  isFromMe: boolean;
  /** 0 normal, 2 name change, 3 group photo, 5 kept audio */
  itemType?: number;
  groupTitle?: string | null;
  groupActionType?: number;
  balloonBundleId?: string | null;
  /**
   * Target of a tapback or sticker. The server may prefix this with `p:0/` or
   * `bp:` — use `parseAssociatedGuid` rather than reading it raw.
   */
  associatedMessageGuid?: string | null;
  associatedMessagePart?: number | null;
  /** "love" | "like" | "dislike" | "laugh" | "emphasize" | "question" | "sticker", `-` prefix removes */
  associatedMessageType?: string | null;
  expressiveSendStyleId?: string | null;
  handle?: Handle | null;
  hasAttachments?: boolean;
  attachments?: Attachment[];
  hasReactions?: boolean;
  /** Reply target. */
  threadOriginatorGuid?: string | null;
  /** "0:0:0" style; the leading segment is the part index. */
  threadOriginatorPart?: string | null;
  /** The server sometimes returns a bare object instead of an array. */
  attributedBody?: AttributedBody[] | AttributedBody | null;
  messageSummaryInfo?: MessageSummaryInfo[] | null;
  metadata?: Record<string, unknown> | string | null;
  chats?: Chat[];
  /** Echoed back on your own sends so the optimistic bubble can be reconciled. */
  tempGuid?: string;
}

export interface Chat {
  ROWID?: number;
  guid: string;
  chatIdentifier?: string;
  displayName?: string | null;
  /** 43 = group, 45 = one-on-one */
  style?: number;
  isArchived?: boolean;
  isPinned?: boolean;
  hasUnreadMessage?: boolean;
  muteType?: string | null;
  muteArgs?: string | null;
  participants?: Handle[];
  lastMessage?: Message | null;
  autoSendReadReceipts?: boolean;
  autoSendTypingIndicators?: boolean;
  dateDeleted?: number | null;
  lastReadMessageGuid?: string | null;
}

export interface ServerInfo {
  os_version?: string;
  server_version?: string;
  private_api?: boolean;
  helper_connected?: boolean;
  detected_icloud?: string;
  proxy_service?: string;
  macos_time_sync?: number;
}

/** A labelled address on a contact card. */
export interface ContactAddress {
  address: string;
  label?: string;
}

/**
 * A contact as returned by `GET /api/v1/contact`.
 *
 * Note the server uses `address` for phone numbers too, not `number`.
 */
export interface ServerContact {
  id?: string;
  displayName?: string;
  firstName?: string;
  lastName?: string;
  /** base64-encoded image, only present with `?extraProperties=avatar`. */
  avatar?: string;
  emails?: ContactAddress[];
  phoneNumbers?: ContactAddress[];
}

/** Every JSON endpoint wraps its payload in this envelope. */
export interface ApiEnvelope<T> {
  status: number;
  message?: string;
  data: T;
  metadata?: { offset: number; limit: number; total: number };
  error?: { type: string; error: string; message: string };
}

export type ReactionType =
  | "love"
  | "like"
  | "dislike"
  | "laugh"
  | "emphasize"
  | "question";

/** Credentials for reaching a BlueBubbles server. */
export interface Connection {
  /** Origin only, no trailing slash, no `/api/v1`. */
  serverUrl: string;
  password: string;
}
