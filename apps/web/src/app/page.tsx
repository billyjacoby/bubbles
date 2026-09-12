import { redirect } from "next/navigation";
import { getConnection } from "@/lib/session";

export default async function RootPage() {
  const connection = await getConnection();
  redirect(connection ? "/chats" : "/setup");
}
