import { generateId, Message } from 'ai';
import { existsSync, mkdirSync } from 'fs';
import { readFile, writeFile } from 'fs/promises';
import path from 'path';

// example implementation for demo purposes
// in a real app, you would save the chat to a database
// and use the id from the database entry

export async function createChat(): Promise<string> {
  const id = generateId();
  await writeFile(getChatFile(id), '[]');
  return id;
}

export async function saveChat({
  id,
  messages,
}: {
  id: string;
  messages: Message[];
}): Promise<void> {
  await writeFile(getChatFile(id), JSON.stringify(messages, null, 2));
}

export async function loadChat(id: string): Promise<Message[]> {
  return JSON.parse(await readFile(getChatFile(id), 'utf8'));
}

function getChatFile(id: string): string {
  const chatDir = path.join(process.cwd(), '.chats');
  if (!existsSync(chatDir)) mkdirSync(chatDir, { recursive: true });
  return path.join(chatDir, `${id}.json`);
}
