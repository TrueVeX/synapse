import ChatApp from "@/components/chat/chat-app";

// A saved chat. ChatApp reads the chat id from the address bar itself, so moving
// between chats updates the URL without reloading the page.
export default function ConversationPage() {
  return <ChatApp />;
}
