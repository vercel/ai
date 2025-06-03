import { generateId } from 'ai';
import { existsSync, mkdirSync } from 'fs';
import { readdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import { ChatModel, MyUIMessage } from './chat-schema';

// example implementation for demo purposes
// in a real app, you would save the chat to a database
// and use the id from the database entry

export async function createChat(): Promise<string> {
  const id = generateId();
  getChatFile(id);
  return id;
}

export async function saveChat({
  chatId,
  messages,
}: {
  chatId: string;
  messages: MyUIMessage[];
}): Promise<void> {
  const chat = await readChat(chatId);
  chat.messages = messages;
  writeChat(chat);
}

export async function appendMessageToChat({
  chatId,
  message,
}: {
  chatId: string;
  message: MyUIMessage;
}): Promise<void> {
  const chat = await readChat(chatId);
  chat.messages.push(message);
  writeChat(chat);
}

async function writeChat(chat: ChatModel) {
  await writeFile(
    await getChatFile(chat.chatId),
    JSON.stringify(chat, null, 2),
  );
}

export async function readChat(id: string): Promise<ChatModel> {
  return JSON.parse(await readFile(await getChatFile(id), 'utf8'));
}

export async function readAllChats(): Promise<ChatModel[]> {
  const chatDir = path.join(process.cwd(), '.chats');
  const files = await readdir(chatDir, { withFileTypes: true });
  return Promise.all(
    files
      .filter(file => file.isFile())
      .map(async file => readChat(file.name.replace('.json', ''))),
  );
}

async function getChatFile(chatId: string): Promise<string> {
  const chatDir = path.join(process.cwd(), '.chats');

  if (!existsSync(chatDir)) mkdirSync(chatDir, { recursive: true });

  const chatFile = path.join(chatDir, `${chatId}.json`);

  if (!existsSync(chatFile)) {
    await writeFile(
      chatFile,
      JSON.stringify({ chatId, messages: [], createdAt: Date.now() }, null, 2),
    );
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
