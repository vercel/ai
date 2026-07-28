import path from 'node:path';
import type { Experimental_SandboxSession } from '@ai-sdk/provider-utils';
import type { AgentMessage } from '@cline/agents';
import { z } from 'zod/v4';

const CLINE_HISTORY_FILE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*\.json$/;

export function safeClineHistoryFileName(historyFileName: string): string {
  if (!CLINE_HISTORY_FILE_NAME_PATTERN.test(historyFileName)) {
    throw new Error(`Invalid Cline history file name: ${historyFileName}`);
  }
  return historyFileName;
}

const clineHistoryFileNameSchema = z
  .string()
  .refine(
    historyFileName => CLINE_HISTORY_FILE_NAME_PATTERN.test(historyFileName),
    'Cline historyFileName must be a safe .json basename.',
  );

/**
 * Schema for the adapter-specific portion of lifecycle state `data` produced
 * by the Cline harness's resumable lifecycle methods. Carries the basename of
 * the serialized conversation history. The actual history bytes live in the
 * sandbox under `${sessionWorkDir}/.cline-harness/<historyFileName>` so they
 * survive cross-process resume via the sandbox snapshot.
 */
export const clineResumeStateSchema = z.looseObject({
  historyFileName: clineHistoryFileNameSchema.optional(),
});

export type ClineResumeStateData = z.infer<typeof clineResumeStateSchema>;

const CLINE_HISTORY_DIR = '.cline-harness';

export const CLINE_DEFAULT_HISTORY_FILE_NAME = 'history.json';

function resolveContainedSandboxPath(input: {
  readonly sessionWorkDir: string;
  readonly historyFileName: string;
}): string {
  const historyDir = path.posix.resolve(
    input.sessionWorkDir,
    CLINE_HISTORY_DIR,
  );
  const filePath = path.posix.resolve(
    historyDir,
    safeClineHistoryFileName(input.historyFileName),
  );
  const relativePath = path.posix.relative(historyDir, filePath);
  if (
    relativePath === '' ||
    relativePath.startsWith('..') ||
    path.posix.isAbsolute(relativePath)
  ) {
    throw new Error(
      `Invalid Cline history file name: ${input.historyFileName}`,
    );
  }
  return filePath;
}

/**
 * Persist the runtime's conversation history into the sandbox workspace so a
 * future process can resume the session after
 * `HarnessV1SandboxProvider.resume?.({ sessionId })` reattaches the sandbox.
 */
export async function persistHistoryToSandbox(args: {
  readonly sandbox: Experimental_SandboxSession;
  readonly sessionWorkDir: string;
  readonly historyFileName: string;
  readonly messages: readonly AgentMessage[];
  readonly abortSignal?: AbortSignal;
}): Promise<void> {
  const remotePath = resolveContainedSandboxPath({
    sessionWorkDir: args.sessionWorkDir,
    historyFileName: args.historyFileName,
  });
  // `writeTextFile` creates parent directories recursively per the
  // SandboxSession contract.
  await args.sandbox.writeTextFile({
    path: remotePath,
    content: JSON.stringify(args.messages),
    ...(args.abortSignal ? { abortSignal: args.abortSignal } : {}),
  });
}

/**
 * Pull a previously persisted conversation history from the sandbox. Returns
 * `undefined` when the file is missing or unparsable — resume then falls back
 * to a fresh conversation rather than failing `doStart`.
 */
export async function pullHistoryFromSandbox(args: {
  readonly sandbox: Experimental_SandboxSession;
  readonly sessionWorkDir: string;
  readonly historyFileName: string;
  readonly abortSignal?: AbortSignal;
}): Promise<AgentMessage[] | undefined> {
  const remotePath = resolveContainedSandboxPath({
    sessionWorkDir: args.sessionWorkDir,
    historyFileName: args.historyFileName,
  });
  const content = await args.sandbox.readTextFile({
    path: remotePath,
    ...(args.abortSignal ? { abortSignal: args.abortSignal } : {}),
  });
  if (content == null) return undefined;
  try {
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? (parsed as AgentMessage[]) : undefined;
  } catch {
    return undefined;
  }
}
