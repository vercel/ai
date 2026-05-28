import type { HarnessV1ResumeState } from '@ai-sdk/harness';
import { existsSync, mkdirSync } from 'fs';
import { readFile, writeFile } from 'fs/promises';
import path from 'path';

// File-based persistence for harness sessions, keyed by a domain id
// (the chat id in the REST example). Mirrors the convention used by
// `chat-store.ts`. In a real app this would be a database row.

export interface StoredHarnessSession {
  sessionId: string;
  state: HarnessV1ResumeState;
}

export async function loadHarnessSession(
  chatId: string,
): Promise<StoredHarnessSession | null> {
  const file = getSessionFile(chatId);
  if (!existsSync(file)) return null;
  const raw = await readFile(file, 'utf8');
  return JSON.parse(raw) as StoredHarnessSession;
}

export async function saveHarnessSession(input: {
  chatId: string;
  sessionId: string;
  state: HarnessV1ResumeState;
}): Promise<void> {
  await writeFile(
    getSessionFile(input.chatId),
    JSON.stringify({ sessionId: input.sessionId, state: input.state }, null, 2),
  );
}

function getSessionFile(chatId: string): string {
  const dir = path.join(process.cwd(), '.harness-sessions');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return path.join(dir, `${chatId}.json`);
}
