"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Connection } from "@bubbles/shared";

const ConnectionContext = createContext<Connection | null>(null);

export function ConnectionProvider({
  connection,
  children,
}: {
  connection: Connection;
  children: ReactNode;
}) {
  return (
    <ConnectionContext.Provider value={connection}>
      {children}
    </ConnectionContext.Provider>
  );
}

/** Throws when used outside the authenticated layout, which is a bug. */
export function useConnection(): Connection {
  const connection = useContext(ConnectionContext);
  if (!connection) {
    throw new Error("useConnection must be used inside a ConnectionProvider");
  }
  return connection;
}
