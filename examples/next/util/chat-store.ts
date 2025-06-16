import { generateId } from 'ai';
import { existsSync, mkdirSync } from 'fs';
import { readdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import { ChatData, MyUIMessage } from './chat-schema';

// example implementation for demo purposes
// in a real app, you would save the chat to a database
// and use the id from the database entry

export async function createChat(): Promise<string> {
  const id = generateId();
  getChatFile(id);
  return id;
}

export async function saveChat({
  id,
  messages,
}: {
  id: string;
  messages: MyUIMessage[];
}): Promise<void> {
  const chat = await readChat(id);
  chat.messages = messages;
  writeChat(chat);
}

export async function appendMessageToChat({
  id,
  message,
}: {
  id: string;
  message: MyUIMessage;
}): Promise<void> {
  const chat = await readChat(id);
  chat.messages.push(message);
  writeChat(chat);
}

async function writeChat(chat: ChatData) {
  await writeFile(await getChatFile(chat.id), JSON.stringify(chat, null, 2));
}

export async function readChat(id: string): Promise<ChatData> {
  return JSON.parse(await readFile(await getChatFile(id), 'utf8'));
}

export async function readAllChats(): Promise<ChatData[]> {
  const chatDir = path.join(process.cwd(), '.chats');
  const files = await readdir(chatDir, { withFileTypes: true });
  return Promise.all(
    files
      .filter(file => file.isFile())
      .map(async file => readChat(file.name.replace('.json', ''))),
  );
}

async function getChatFile(id: string): Promise<string> {
  const chatDir = path.join(process.cwd(), '.chats');

  if (!existsSync(chatDir)) mkdirSync(chatDir, { recursive: true });

  const chatFile = path.join(chatDir, `${id}.json`);

  if (!existsSync(chatFile)) {
    await writeFile(
      chatFile,
      JSON.stringify({ id, messages: [], createdAt: Date.now() }, null, 2),
    );
  }

  return chatFile;
}

export async function appendStreamId({
  id,
  streamId,
}: {
  id: string;
  streamId: string;
}) {
  const file = getStreamsFile(id);
  const streams = await loadStreams(id);
  streams.push(streamId);
  await writeFile(file, JSON.stringify(streams, null, 2));
}

export async function loadStreams(id: string): Promise<string[]> {
  const file = getStreamsFile(id);
  if (!existsSync(file)) return [];
  return JSON.parse(await readFile(file, 'utf8'));
}

function getStreamsFile(id: string): string {
  const chatDir = path.join(process.cwd(), '.streams');
  if (!existsSync(chatDir)) mkdirSync(chatDir, { recursive: true });
  return path.join(chatDir, `${id}.json`);
}
