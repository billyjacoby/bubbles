"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export function SetupForm({ initialServerUrl }: { initialServerUrl?: string }) {
  const router = useRouter();
  const [serverUrl, setServerUrl] = useState(initialServerUrl ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);

    try {
      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serverUrl, password }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Could not connect to that server.");
        return;
      }

      router.replace("/chats");
      router.refresh();
    } catch {
      setError("Something went wrong while connecting.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex w-full max-w-sm flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="serverUrl" className="text-sm font-medium">
          Server URL
        </label>
        <input
          id="serverUrl"
          name="serverUrl"
          type="text"
          required
          autoComplete="url"
          placeholder="https://your-server.ngrok.io"
          value={serverUrl}
          onChange={(e) => setServerUrl(e.target.value)}
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-sm font-medium">
          Server password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
        />
      </div>

      {error ? (
        <p role="alert" className="text-sm text-red-500">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white transition-opacity disabled:opacity-50"
      >
        {pending ? "Connecting…" : "Connect"}
      </button>
    </form>
  );
}
