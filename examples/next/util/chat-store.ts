import { generateId } from 'ai';
import { existsSync, mkdirSync } from 'fs';
import { readdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import type { ChatData, MyUIMessage } from './chat-schema';

// example implementation for demo purposes
// in a real app, you would save the chat to a database
// and use the id from the database entry

// Treat chat IDs as opaque tokens before using them in file paths.
const chatIdRegex = /^[A-Za-z0-9_-]+$/;
const chatWriteQueues = new Map<string, Promise<void>>();

export async function createChat(): Promise<string> {
  const id = generateId();
  await getChatFile(id);
  return id;
}

export async function saveChat({
  id,
  activeStreamId,
  messages,
  canceledAt,
}: {
  id: string;
  activeStreamId?: string | null;
  messages?: MyUIMessage[];
  canceledAt?: number | null;
}): Promise<void> {
  await queueChatWrite(id, async () => {
    const chat = await readChat(id);

    if (messages !== undefined) {
      chat.messages = messages;
    }

    if (activeStreamId !== undefined) {
      chat.activeStreamId = activeStreamId;
    }

    if (canceledAt !== undefined) {
      chat.canceledAt = canceledAt;
    }

    await writeChat(chat);
  });
}

export async function appendMessageToChat({
  id,
  message,
}: {
  id: string;
  message: MyUIMessage;
}): Promise<void> {
  await queueChatWrite(id, async () => {
    const chat = await readChat(id);
    chat.messages.push(message);
    await writeChat(chat);
  });
}

/**
 * Serializes read-modify-write operations for one chat. A chat request starts
 * several asynchronous writes (message persistence, stream setup, and stream
 * completion), which otherwise can each overwrite fields read by another one.
 */
function queueChatWrite<T>(
  id: string,
  operation: () => Promise<T>,
): Promise<T> {
  const previous = chatWriteQueues.get(id) ?? Promise.resolve();
  const result = previous.then(operation, operation);
  const queue = result.then(
    () => undefined,
    () => undefined,
  );

  chatWriteQueues.set(id, queue);

  void queue.finally(() => {
    if (chatWriteQueues.get(id) === queue) {
      chatWriteQueues.delete(id);
    }
  });

  return result;
}

async function writeChat(chat: ChatData) {
  await writeFile(await getChatFile(chat.id), JSON.stringify(chat, null, 2));
}

// TODO return null if the chat does not exist
export async function readChat(id: string): Promise<ChatData> {
  return JSON.parse(await readFile(await getChatFile(id), 'utf8'));
}

export async function readAllChats(): Promise<ChatData[]> {
  const chatDir = getChatDir();
  const files = await readdir(chatDir, { withFileTypes: true });
  return Promise.all(
    files
      .filter(file => file.isFile())
      .map(file => file.name.match(/^([A-Za-z0-9_-]+)\.json$/)?.[1])
      .filter(id => id != null)
      .map(async id => readChat(id)),
  );
}

async function getChatFile(id: string): Promise<string> {
  const chatDir = getChatDir();
  const chatFile = getSafeChatFilePath({ chatDir, id });

  if (!existsSync(chatDir)) mkdirSync(chatDir, { recursive: true });

  if (!existsSync(chatFile)) {
    const blankChat: ChatData = {
      id,
      messages: [],
      createdAt: Date.now(),
      activeStreamId: null,
      canceledAt: null,
    };
    await writeFile(chatFile, JSON.stringify(blankChat, null, 2));
  }

  return chatFile;
}

function getChatDir(): string {
  return path.resolve(process.cwd(), '.chats');
}

function getSafeChatFilePath({
  chatDir,
  id,
}: {
  chatDir: string;
  id: string;
}): string {
  if (!chatIdRegex.test(id)) {
    throw new Error('Invalid chat ID');
  }

  const chatFile = path.resolve(chatDir, `${id}.json`);

  // Defense in depth: keep the resolved file inside the chat directory.
  if (!chatFile.startsWith(`${chatDir}${path.sep}`)) {
    throw new Error('Invalid chat ID');
  }

  return chatFile;
}
