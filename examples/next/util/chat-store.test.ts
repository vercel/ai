import { afterEach, describe, expect, it } from 'vitest';
import { rm } from 'fs/promises';
import path from 'path';
import { readChat, saveChat } from './chat-store';

const id = 'concurrent-update-test';
const chatDirectory = path.join(process.cwd(), '.chats');

afterEach(async () => {
  await rm(path.join(chatDirectory, `${id}.json`), { force: true });
  await rm(chatDirectory, { recursive: true, force: true });
});

describe('chat store', () => {
  it('preserves concurrent updates to separate chat fields', async () => {
    const messages = [
      {
        id: 'message-1',
        role: 'user' as const,
        parts: [{ type: 'text' as const, text: 'Hello' }],
      },
    ];

    await Promise.all([
      saveChat({ id, messages }),
      saveChat({ id, activeStreamId: 'stream-1' }),
      saveChat({ id, canceledAt: 123 }),
    ]);

    await expect(readChat(id)).resolves.toMatchObject({
      id,
      messages,
      activeStreamId: 'stream-1',
      canceledAt: 123,
    });
  });
});
