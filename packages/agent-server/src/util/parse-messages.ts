import { convertToCoreMessages, CoreMessage, Message } from 'ai';

export async function parseMessages(request: Request): Promise<CoreMessage[]> {
  const { messages } = (await request.json()) as { messages: Message[] };
  return convertToCoreMessages(messages);
}
