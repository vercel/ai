import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { HarnessV1NetworkSandboxSession } from '@ai-sdk/harness';
import type {
  HarnessAgent,
  HarnessAgentResumeSessionState,
  HarnessAgentSession,
} from '@ai-sdk/harness/agent';
import { safeParseJSON } from '@ai-sdk/provider-utils';
import { acquireHarnessSandboxSession } from './harness-sandbox-session';

/*
 * Durable, cross-process resume store for every harness chat route.
 *
 * Instead of holding the (non-serializable) live session in an in-memory
 * registry, we persist only the serializable payload returned by `detach()`
 * or `stop()`. On the next request, even in a fresh server process, we resume
 * the named sandbox and call `createSession({ sessionId, resumeFrom,
 * sandboxSession })`. Routes that want to keep the sandbox warm use `detach()`:
 * bridge-backed harnesses usually resume by `attach`/`replay`, while
 * host-resident harnesses may resume by `rerun`.
 *
 * Files live under the git-ignored `.harness-sessions/` directory, keyed by
 * chat id. The chat id doubles as the `sessionId`, so the deterministic sandbox
 * name is derived from it. A fresh process resumes the existing sandbox
 * session instead of attempting to create a second sandbox with that name.
 */
const STORE_DIR = path.join(process.cwd(), '.harness-sessions');

function fileFor(chatId: string): string {
  const safe = chatId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(STORE_DIR, `${safe}.json`);
}

async function loadResumeState(
  chatId: string,
): Promise<HarnessAgentResumeSessionState | undefined> {
  let text: string;
  try {
    text = await readFile(fileFor(chatId), 'utf8');
  } catch {
    return undefined;
  }
  const parsed = await safeParseJSON({ text });
  return parsed.success
    ? (parsed.value as unknown as HarnessAgentResumeSessionState)
    : undefined;
}

async function saveResumeState(
  chatId: string,
  state: HarnessAgentResumeSessionState,
): Promise<void> {
  await mkdir(STORE_DIR, { recursive: true });
  await writeFile(fileFor(chatId), JSON.stringify(state), 'utf8');
}

type SessionFactory = Pick<HarnessAgent, 'getSandboxTemplate'> & {
  createSession(options: {
    sessionId: string;
    resumeFrom?: HarnessAgentResumeSessionState;
    sandboxSession: HarnessV1NetworkSandboxSession;
  }): Promise<HarnessAgentSession>;
};

/**
 * Resume the chat when we have persisted state, otherwise start a fresh
 * session. `chatId` doubles as the `sessionId` so the sandbox name is stable
 * across processes.
 */
export async function resumeOrCreateSession({
  agent,
  chatId,
  ports,
}: {
  agent: SessionFactory;
  chatId: string;
  ports?: number[];
}): Promise<{
  session: HarnessAgentSession;
  sandboxSession: HarnessV1NetworkSandboxSession;
}> {
  const resumeFrom = await loadResumeState(chatId);
  const sandboxSession = await acquireHarnessSandboxSession({
    agent,
    sessionId: chatId,
    resumeFrom,
    ...(ports == null ? {} : { ports }),
  });
  try {
    const session = await agent.createSession({
      sessionId: chatId,
      resumeFrom,
      sandboxSession,
    });
    return { session, sandboxSession };
  } catch (error) {
    if (resumeFrom == null) {
      await Promise.resolve(sandboxSession.destroy()).catch(cleanupError => {
        console.error(`[harness] failed to clean up ${chatId}:`, cleanupError);
      });
    }
    throw error;
  }
}

/**
 * Park a session after the turn and persist the returned state. The sandbox
 * keeps running for the next request.
 */
export async function detachAndPersist({
  chatId,
  session,
}: {
  chatId: string;
  session: HarnessAgentSession;
}): Promise<void> {
  try {
    await saveResumeState(chatId, await session.detach());
  } catch (error) {
    // Non-fatal: the turn already streamed to the client, and the next request
    // just resumes from the previous checkpoint (or starts cold). Surfaced so a
    // misconfiguration (unwritable dir, failed save) doesn't fail silently and
    // leave resume quietly broken.
    console.error(`[harness] failed to detach+persist for ${chatId}:`, error);
  }
}

/**
 * Stop the harness and sandbox after the turn, then persist the resume state.
 * The next request resumes the sandbox before starting the harness again.
 */
export async function stopAndPersist({
  chatId,
  session,
  sandboxSession,
}: {
  chatId: string;
  session: HarnessAgentSession;
  sandboxSession: HarnessV1NetworkSandboxSession;
}): Promise<void> {
  let resumeFrom: HarnessAgentResumeSessionState | undefined;
  try {
    resumeFrom = await session.stop();
  } catch (error) {
    console.error(`[harness] failed to stop harness for ${chatId}:`, error);
  }
  try {
    await sandboxSession.stop();
  } catch (error) {
    console.error(`[harness] failed to stop sandbox for ${chatId}:`, error);
  }
  if (resumeFrom != null) {
    try {
      await saveResumeState(chatId, resumeFrom);
    } catch (error) {
      console.error(
        `[harness] failed to persist resume state for ${chatId}:`,
        error,
      );
    }
  }
}
