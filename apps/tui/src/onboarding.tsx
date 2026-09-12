import { useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import {
  normalizeServerUrl,
  ping,
  type Connection,
} from "@bubbles/shared";
import { saveConnection } from "./config.js";

interface OnboardingProps {
  initial?: Partial<Connection>;
  onConnected: (connection: Connection) => void;
}

const ACCENT = "#82fb9c";

function printable(input: string): boolean {
  return Boolean(input) && !/\p{C}/u.test(input);
}

export function Onboarding({ initial, onConnected }: OnboardingProps) {
  const { exit } = useApp();
  const [field, setField] = useState<"server" | "password">("server");
  const [server, setServer] = useState(initial?.serverUrl ?? "");
  const [password, setPassword] = useState(initial?.password ?? "");
  const [status, setStatus] = useState("Enter your BlueBubbles connection details.");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (submitting) return;
    if (!server.trim()) {
      setField("server");
      setStatus("A server URL is required.");
      return;
    }
    if (!password) {
      setField("password");
      setStatus("A password is required.");
      return;
    }

    let connection: Connection;
    try {
      connection = { serverUrl: normalizeServerUrl(server), password };
    } catch {
      setField("server");
      setStatus("That server URL is not valid.");
      return;
    }

    setSubmitting(true);
    setStatus("Connecting…");
    try {
      if (!(await ping(connection))) {
        throw new Error("The server did not respond to the BlueBubbles ping.");
      }
      setStatus("Connected. Saving…");
      await saveConnection(connection);
      onConnected(connection);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not connect.");
    } finally {
      setSubmitting(false);
    }
  };

  useInput((input, key) => {
    if (key.ctrl && input === "c") return exit();
    if (submitting) return;
    if (key.tab || key.upArrow || key.downArrow) {
      return setField((current) => current === "server" ? "password" : "server");
    }
    if (key.return) {
      if (field === "server") {
        if (server.trim()) setField("password");
        else setStatus("A server URL is required.");
      } else {
        void submit();
      }
      return;
    }
    if (key.backspace || key.delete) {
      const trimLast = (value: string) => Array.from(value).slice(0, -1).join("");
      if (field === "server") setServer(trimLast);
      else setPassword(trimLast);
      return;
    }
    if (printable(input) && !key.ctrl && !key.meta) {
      if (field === "server") setServer((value) => value + input);
      else setPassword((value) => value + input);
    }
  });

  const columns = process.stdout.columns ?? 80;
  const inputWidth = Math.max(20, Math.min(72, columns - 12));
  const cursor = <Text inverse> </Text>;

  return (
    <Box flexDirection="column" padding={1}>
      <Box borderStyle="double" borderColor={ACCENT} flexDirection="column" paddingX={2}>
        <Text bold color={ACCENT}>BUBBLES · FIRST RUN</Text>
        <Text>Connect directly to your BlueBubbles server.</Text>
        <Text> </Text>

        <Text bold={field === "server"} color={field === "server" ? ACCENT : undefined}>
          Server URL
        </Text>
        <Box borderStyle="single" borderColor={field === "server" ? ACCENT : "gray"} paddingX={1}>
          <Text>{server.slice(-inputWidth)}</Text>
          {field === "server" && cursor}
        </Box>

        <Text bold={field === "password"} color={field === "password" ? ACCENT : undefined}>
          Password
        </Text>
        <Box borderStyle="single" borderColor={field === "password" ? ACCENT : "gray"} paddingX={1}>
          <Text>{"•".repeat(Math.min(password.length, inputWidth))}</Text>
          {field === "password" && cursor}
        </Box>

        <Text> </Text>
        <Text color={status.includes("required") || status.includes("not valid") || status.includes("Could not") ? "red" : "gray"}>
          {status}
        </Text>
        <Text color="gray">Tab/↑↓ switch fields · Enter continue/connect · Ctrl+C quit</Text>
        <Text color="gray">Credentials are stored locally with owner-only permissions.</Text>
      </Box>
    </Box>
  );
}
