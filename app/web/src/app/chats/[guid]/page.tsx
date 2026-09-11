import { ChatView } from "@/components/chat-view";

export default async function ChatPage({ params }: PageProps<"/chats/[guid]">) {
  // Route params are async in this version of Next.
  const { guid } = await params;
  return <ChatView chatGuid={decodeURIComponent(guid)} />;
}
