"use client";

import { useMemo, useState } from "react";
import { FileDown, Play } from "lucide-react";
import { attachmentUrl } from "@/lib/api/client";
import { useConnection } from "@/components/connection-provider";
import type { Attachment } from "@/lib/types";

function kindOf(attachment: Attachment): "image" | "video" | "audio" | "file" {
  const mime = attachment.mimeType ?? "";
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "file";
}

function formatBytes(bytes: number | undefined): string {
  if (!bytes) return "";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value < 10 && unit > 0 ? 1 : 0)} ${units[unit]}`;
}

export function AttachmentView({ attachment }: { attachment: Attachment }) {
  const conn = useConnection();
  const [failed, setFailed] = useState(false);

  // Auth is a query param, so the URL works directly in `src`/`href`.
  const url = useMemo(
    () => attachmentUrl(conn, attachment.guid),
    [conn, attachment.guid],
  );
  const name = attachment.transferName ?? "Attachment";
  const kind = kindOf(attachment);

  if (failed || kind === "file") {
    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        download={name}
        className="flex items-center gap-2 rounded-xl border border-border bg-background/50 px-3 py-2 text-xs hover:bg-surface-hover"
      >
        <FileDown className="size-4 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1 truncate">{name}</span>
        <span className="shrink-0 text-muted">
          {formatBytes(attachment.totalBytes)}
        </span>
      </a>
    );
  }

  if (kind === "image") {
    // Sized from the server's own metadata to reserve layout space and avoid
    // the thread jumping as images decode.
    const ratio =
      attachment.width && attachment.height
        ? attachment.width / attachment.height
        : undefined;

    return (
      <a href={url} target="_blank" rel="noreferrer" className="block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={name}
          loading="lazy"
          style={ratio ? { aspectRatio: String(ratio) } : undefined}
          onError={() => setFailed(true)}
          className="max-h-80 max-w-full rounded-xl object-cover"
        />
      </a>
    );
  }

  if (kind === "video") {
    return (
      <video
        src={url}
        controls
        preload="metadata"
        onError={() => setFailed(true)}
        className="max-h-80 max-w-full rounded-xl"
      >
        <track kind="captions" />
      </video>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-xl border border-border bg-background/50 px-3 py-2">
      <Play className="size-4 shrink-0" aria-hidden />
      <audio src={url} controls onError={() => setFailed(true)} className="h-8" />
    </div>
  );
}
