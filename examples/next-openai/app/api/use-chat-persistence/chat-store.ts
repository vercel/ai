import { Message } from 'ai';
import { existsSync, mkdirSync } from 'fs';
import { readFile, writeFile } from 'fs/promises';
import path from 'path';

// example implementation for demo purposes
// in a real app, you would save the chat to a database.
export async function saveChat({
  id,
  messages,
}: {
  id: string;
  messages: Message[];
}): Promise<void> {
  await writeFile(getChatFile(id), JSON.stringify(messages, null, 2));
}

export async function loadChat({ id }: { id: string }): Promise<Message[]> {
  const file = getChatFile(id);

  if (!existsSync(file)) {
    await writeFile(file, '[]');
  }

  return JSON.parse(await readFile(file, 'utf8'));
}

function getChatFile(chatId: string): string {
  const chatDir = path.join(process.cwd(), '.chats');

  if (!existsSync(chatDir)) {
    mkdirSync(chatDir, { recursive: true });
  }

  return path.join(chatDir, `${chatId}.json`);
}
