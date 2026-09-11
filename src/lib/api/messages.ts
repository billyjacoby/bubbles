import { requestData } from "@/lib/api/client";
import type { Connection, Message, ReactionType } from "@/lib/types";

/** Client-generated dedupe key echoed back by the server on your own sends. */
export function makeTempGuid(): string {
  return `temp-${crypto.randomUUID()}`;
}

export type SendMethod = "private-api" | "apple-script";

export interface SendTextParams {
  chatGuid: string;
  message: string;
  tempGuid?: string;
  /**
   * AppleScript can only send plain text. Subjects, replies and effects all
   * require the Private API helper, so `resolveSendMethod` upgrades for them.
   */
  method?: SendMethod;
  subject?: string | null;
  /** GUID of the message being replied to. */
  selectedMessageGuid?: string | null;
  partIndex?: number | null;
  effectId?: string | null;
  /** Run the data detector so link previews generate. Ventura+ only. */
  ddScan?: boolean;
}

/**
 * Pick the transport for a send. Anything richer than plain text is impossible
 * over AppleScript, so those options force the Private API path.
 */
export function resolveSendMethod(
  params: Pick<SendTextParams, "subject" | "selectedMessageGuid" | "effectId">,
  privateApiAvailable: boolean,
): SendMethod {
  const needsPrivateApi =
    Boolean(params.subject) ||
    Boolean(params.selectedMessageGuid) ||
    Boolean(params.effectId);
  if (privateApiAvailable || needsPrivateApi) return "private-api";
  return "apple-script";
}

export function sendText(
  conn: Connection,
  params: SendTextParams,
): Promise<Message> {
  const {
    chatGuid,
    message,
    tempGuid = makeTempGuid(),
    method = "apple-script",
    subject,
    selectedMessageGuid,
    partIndex,
    effectId,
    ddScan,
  } = params;

  const body: Record<string, unknown> = {
    chatGuid,
    tempGuid,
    // An empty body with only a subject must still carry a space.
    message: message.length === 0 && subject ? " " : message,
    method,
  };

  // These keys are only meaningful on the private-api path; sending them with
  // AppleScript is at best ignored and at worst an error.
  if (method === "private-api") {
    if (subject) body.subject = subject;
    if (selectedMessageGuid) body.selectedMessageGuid = selectedMessageGuid;
    if (partIndex !== null && partIndex !== undefined) body.partIndex = partIndex;
    if (effectId) body.effectId = effectId;
    if (ddScan !== undefined) body.ddScan = ddScan;
  }

  return requestData<Message>(conn, "/message/text", { method: "POST", body });
}

export interface SendAttachmentParams {
  chatGuid: string;
  file: File;
  tempGuid?: string;
  method?: SendMethod;
  isAudioMessage?: boolean;
}

export function sendAttachment(
  conn: Connection,
  params: SendAttachmentParams,
): Promise<Message> {
  const {
    chatGuid,
    file,
    tempGuid = makeTempGuid(),
    method = "apple-script",
    isAudioMessage,
  } = params;

  const form = new FormData();
  form.append("attachment", file, file.name);
  form.append("chatGuid", chatGuid);
  form.append("tempGuid", tempGuid);
  form.append("name", file.name);
  form.append("method", method);
  if (isAudioMessage) form.append("isAudioMessage", "true");

  return requestData<Message>(conn, "/message/attachment", {
    method: "POST",
    formData: form,
  });
}

/**
 * Send or remove a tapback. Requires the Private API helper.
 * Prefix the reaction with `-` to remove it.
 */
export function react(
  conn: Connection,
  params: {
    chatGuid: string;
    selectedMessageGuid: string;
    selectedMessageText: string;
    reaction: ReactionType;
    remove?: boolean;
    partIndex?: number;
  },
): Promise<Message> {
  return requestData<Message>(conn, "/message/react", {
    method: "POST",
    body: {
      chatGuid: params.chatGuid,
      selectedMessageGuid: params.selectedMessageGuid,
      selectedMessageText: params.selectedMessageText,
      reaction: params.remove ? `-${params.reaction}` : params.reaction,
      partIndex: params.partIndex ?? 0,
    },
  });
}

export function unsend(
  conn: Connection,
  guid: string,
  partIndex = 0,
): Promise<unknown> {
  return requestData(conn, `/message/${encodeURIComponent(guid)}/unsend`, {
    method: "POST",
    body: { partIndex },
  });
}

export function edit(
  conn: Connection,
  guid: string,
  params: {
    editedMessage: string;
    backwardsCompatibilityMessage: string;
    partIndex?: number;
  },
): Promise<unknown> {
  return requestData(conn, `/message/${encodeURIComponent(guid)}/edit`, {
    method: "POST",
    body: { partIndex: 0, ...params },
  });
}
