import { loadChat } from '../chat-store';

export async function GET(
  req: Request,
  { params }: { params: { chatId: string } },
) {
  return Response.json(await loadChat({ id: params.chatId }));
}
