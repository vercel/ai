import { generateId, UIMessage } from 'ai';
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
  chatId,
  messages,
}: {
  chatId: string;
  messages: UIMessage[];
}): Promise<void> {
  await writeFile(getChatFile(chatId), JSON.stringify(messages, null, 2));
}

export async function appendMessageToChat({
  chatId,
  message,
}: {
  chatId: string;
  message: UIMessage;
}): Promise<void> {
  const file = getChatFile(chatId);
  const messages = await loadChat(chatId);
  messages.push(message);
  await writeFile(file, JSON.stringify(messages, null, 2));
}

export async function loadChat(id: string): Promise<UIMessage[]> {
  return JSON.parse(await readFile(getChatFile(id), 'utf8'));
}

function getChatFile(id: string): string {
  const chatDir = path.join(process.cwd(), '.chats');

  if (!existsSync(chatDir)) mkdirSync(chatDir, { recursive: true });

  const chatFile = path.join(chatDir, `${id}.json`);

  if (!existsSync(chatFile)) {
    writeFile(chatFile, '[]');
  }

  return chatFile;
}

export async function appendStreamId({
  chatId,
  streamId,
}: {
  chatId: string;
  streamId: string;
}) {
  const file = getStreamsFile(chatId);
  const streams = await loadStreams(chatId);
  streams.push(streamId);
  await writeFile(file, JSON.stringify(streams, null, 2));
}

export async function loadStreams(chatId: string): Promise<string[]> {
  const file = getStreamsFile(chatId);
  if (!existsSync(file)) return [];
  return JSON.parse(await readFile(file, 'utf8'));
}

function getStreamsFile(chatId: string): string {
  const chatDir = path.join(process.cwd(), '.streams');
  if (!existsSync(chatDir)) mkdirSync(chatDir, { recursive: true });
  return path.join(chatDir, `${chatId}.json`);
}
