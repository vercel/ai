import { Chat } from '../chat';

export default async function ChatPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <Chat key={id} id={id} />;
}
