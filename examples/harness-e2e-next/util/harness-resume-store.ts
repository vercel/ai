import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { HarnessV1ResumeState } from '@ai-sdk/harness';
import type { HarnessAgentSession } from '@ai-sdk/harness/agent';
import { safeParseJSON } from '@ai-sdk/provider-utils';

/*
 * Durable, cross-process resume store for every harness chat route.
 *
 * Instead of holding the (non-serializable) live session in an in-memory
 * registry, we persist only the serializable payload returned by
 * `session.getResumeHandle()` and reattach with
 * `createSession({ sessionId, resumeFrom })` on the next request — even in a
 * fresh server process. What the payload carries and how the framework recovers
 * depends on the harness:
 *   - Claude Code / Codex carry live bridge coordinates → `attach` to the still
 *     running bridge (falling back to `replay`/`rerun` if it has since died).
 *   - Pi carries its session-file name → `rerun` from the restored journal on
 *     the snapshotted sandbox (it has no bridge to attach to).
 *
 * Files live under the git-ignored `.harness-sessions/` directory, keyed by
 * chat id. The chat id doubles as the `sessionId`, so the deterministic sandbox
 * name is derived from it and a fresh process resolves the same sandbox via
 * `provider.resume` (`Sandbox.get`) rather than colliding on `provider.create`.
 */
const STORE_DIR = path.join(process.cwd(), '.harness-sessions');

function fileFor(chatId: string): string {
  const safe = chatId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(STORE_DIR, `${safe}.json`);
}

async function loadResumeState(
  chatId: string,
): Promise<HarnessV1ResumeState | undefined> {
  let text: string;
  try {
    text = await readFile(fileFor(chatId), 'utf8');
  } catch {
    return undefined;
  }
  const parsed = await safeParseJSON({ text });
  return parsed.success ? (parsed.value as HarnessV1ResumeState) : undefined;
}

async function saveResumeState(
  chatId: string,
  state: HarnessV1ResumeState,
): Promise<void> {
  await mkdir(STORE_DIR, { recursive: true });
  await writeFile(fileFor(chatId), JSON.stringify(state), 'utf8');
}

type SessionFactory = {
  createSession(options?: {
    sessionId?: string;
    resumeFrom?: HarnessV1ResumeState;
  }): Promise<HarnessAgentSession>;
};

/**
 * Reattach to the chat's still-running bridge when we have persisted
 * coordinates, otherwise start a fresh session. `chatId` doubles as the
 * `sessionId` so the sandbox name is stable across processes.
 */
export async function resumeOrCreateSession(
  agent: SessionFactory,
  chatId: string,
): Promise<HarnessAgentSession> {
  const resumeFrom = await loadResumeState(chatId);
  return agent.createSession(
    resumeFrom ? { sessionId: chatId, resumeFrom } : { sessionId: chatId },
  );
}

/**
 * Persist the live bridge coordinates after a turn completes. Non-destructive
 * (the bridge keeps running for the next request to attach to) and read
 * *after* the turn so the cursor is final and a later attach replays nothing.
 */
export async function persistResumeState(
  chatId: string,
  session: HarnessAgentSession,
): Promise<void> {
  try {
    await saveResumeState(chatId, await session.getResumeHandle());
  } catch (error) {
    // Non-fatal: the turn already streamed to the client, and the next request
    // just resumes from the previous checkpoint (or starts cold). Surfaced so a
    // misconfiguration (unwritable dir, unsupported harness) doesn't fail
    // silently and leave attach quietly broken.
    console.error(
      `[harness] failed to persist resume state for ${chatId}:`,
      error,
    );
  }
}

/**
 * Detach the session after the turn and persist the returned state. Unlike
 * `persistResumeState`, this **stops** the sandbox (it snapshots), so the next
 * request resumes from the snapshot rather than attaching to a live bridge —
 * the `rerun` path. Used by the `/detach` example routes to contrast the
 * detach-then-resume lifecycle with the default keep-alive `attach` one.
 */
export async function detachAndPersist(
  chatId: string,
  session: HarnessAgentSession,
): Promise<void> {
  try {
    await saveResumeState(chatId, await session.detach());
  } catch (error) {
    // Non-fatal: the turn already streamed to the client. A failed detach just
    // means the next request starts cold. Surfaced rather than swallowed.
    console.error(`[harness] failed to detach+persist for ${chatId}:`, error);
  }
}
