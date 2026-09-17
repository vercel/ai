import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { Experimental_SandboxSession } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

const PI_SESSION_FILE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*\.jsonl?$/;

export function safePiSessionFileName(sessionFileName: string): string {
  if (!PI_SESSION_FILE_NAME_PATTERN.test(sessionFileName)) {
    throw new Error(`Invalid Pi session file name: ${sessionFileName}`);
  }
  return sessionFileName;
}

const piSessionFileNameSchema = z
  .string()
  .refine(
    sessionFileName => PI_SESSION_FILE_NAME_PATTERN.test(sessionFileName),
    'Pi sessionFileName must be a safe .jsonl or .json basename.',
  );

/**
 * Schema for the adapter-specific portion of lifecycle state `data` produced
 * by Pi's resumable lifecycle methods. Carries the basename
 * (including extension) of the Pi session file. The actual session bytes live
 * in a private, session-scoped directory under sandbox HOME so they survive
 * cross-process resume without appearing in the agent workspace.
 */
export const piResumeStateSchema = z.looseObject({
  sessionFileName: piSessionFileNameSchema.optional(),
});

export type PiResumeStateData = z.infer<typeof piResumeStateSchema>;

export function resolvePiPrivateSessionDirectory(input: {
  readonly sandboxHomeDir: string;
  readonly sessionWorkDir: string;
  readonly sessionId: string;
}): string {
  const sessionKey = createHash('sha256').update(input.sessionId).digest('hex');
  const privateSessionDir = path.posix.join(
    input.sandboxHomeDir,
    '.ai-sdk',
    'harness-pi',
    sessionKey,
  );
  const relativePath = path.posix.relative(
    input.sessionWorkDir,
    privateSessionDir,
  );
  if (
    relativePath === '' ||
    (!relativePath.startsWith('../') && !path.posix.isAbsolute(relativePath))
  ) {
    throw new Error(
      `Pi private session directory ${JSON.stringify(privateSessionDir)} must be outside sessionWorkDir ${JSON.stringify(input.sessionWorkDir)}.`,
    );
  }
  return privateSessionDir;
}

function resolveContainedHostPath(input: {
  readonly baseDir: string;
  readonly sessionFileName: string;
}): string {
  const baseDir = path.resolve(input.baseDir);
  const filePath = path.resolve(
    baseDir,
    safePiSessionFileName(input.sessionFileName),
  );
  const relativePath = path.relative(baseDir, filePath);
  if (
    relativePath === '' ||
    relativePath.startsWith('..') ||
    path.isAbsolute(relativePath)
  ) {
    throw new Error(`Invalid Pi session file name: ${input.sessionFileName}`);
  }
  return filePath;
}

function resolveContainedSandboxPath(input: {
  readonly privateSessionDir: string;
  readonly sessionFileName: string;
}): string {
  const sessionDir = path.posix.resolve(input.privateSessionDir);
  const filePath = path.posix.resolve(
    sessionDir,
    safePiSessionFileName(input.sessionFileName),
  );
  const relativePath = path.posix.relative(sessionDir, filePath);
  if (
    relativePath === '' ||
    relativePath.startsWith('..') ||
    path.posix.isAbsolute(relativePath)
  ) {
    throw new Error(`Invalid Pi session file name: ${input.sessionFileName}`);
  }
  return filePath;
}

/**
 * Copy the Pi session file from the host's local mirror to private sandbox
 * state. Called during resumable lifecycle methods so the session survives a
 * sandbox snapshot or a process handoff.
 */
export async function persistSessionFileToSandbox(args: {
  readonly sandbox: Experimental_SandboxSession;
  readonly privateSessionDir: string;
  readonly hostSessionDir: string;
  readonly sessionFileName: string;
  readonly abortSignal?: AbortSignal;
}): Promise<void> {
  const hostPath = resolveContainedHostPath({
    baseDir: args.hostSessionDir,
    sessionFileName: args.sessionFileName,
  });
  const content = await readFile(hostPath);
  const remotePath = resolveContainedSandboxPath({
    privateSessionDir: args.privateSessionDir,
    sessionFileName: args.sessionFileName,
  });
  await args.sandbox.writeBinaryFile({
    path: remotePath,
    content,
    ...(args.abortSignal ? { abortSignal: args.abortSignal } : {}),
  });
}

/**
 * Pull a previously persisted Pi session file from the sandbox into a fresh
 * local mirror dir. Called during `doStart` on the resume path before Pi is
 * initialised. Returns the absolute path of the local session file or
 * `undefined` if the sandbox copy is missing.
 */
export async function pullSessionFileFromSandbox(args: {
  readonly sandbox: Experimental_SandboxSession;
  readonly privateSessionDir: string;
  readonly hostSessionDir: string;
  readonly sessionFileName: string;
  readonly abortSignal?: AbortSignal;
}): Promise<string | undefined> {
  const remotePath = resolveContainedSandboxPath({
    privateSessionDir: args.privateSessionDir,
    sessionFileName: args.sessionFileName,
  });
  const bytes = await args.sandbox.readBinaryFile({
    path: remotePath,
    ...(args.abortSignal ? { abortSignal: args.abortSignal } : {}),
  });
  if (bytes == null) return undefined;
  await mkdir(args.hostSessionDir, { recursive: true });
  const hostPath = resolveContainedHostPath({
    baseDir: args.hostSessionDir,
    sessionFileName: args.sessionFileName,
  });
  await writeFile(hostPath, bytes);
  return hostPath;
}
