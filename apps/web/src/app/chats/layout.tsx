import { redirect } from "next/navigation";
import { getConnection } from "@/lib/session";
import { ConnectionProvider } from "@/components/connection-provider";
import { QueryProvider } from "@/components/query-provider";
import { AppShell } from "@/components/app-shell";

export default async function ChatsLayout({ children }: LayoutProps<"/chats">) {
  const connection = await getConnection();
  if (!connection) redirect("/setup");

  return (
    <QueryProvider>
      {/*
        The password is read from the httpOnly cookie here and handed to the
        client so it can call the BlueBubbles server directly. Swapping to a
        server-side proxy later means changing only this boundary.
      */}
      <ConnectionProvider connection={connection}>
        <AppShell>{children}</AppShell>
      </ConnectionProvider>
    </QueryProvider>
  );
}
