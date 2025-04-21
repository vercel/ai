import { Chat } from '../chat';


export default async function Page({ params }: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params;

  return (
    <Chat chatId={id} />
  );
}
