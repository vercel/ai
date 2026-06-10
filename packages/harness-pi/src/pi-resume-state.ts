import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { Experimental_SandboxSession } from '@ai-sdk/provider-utils';
import { z } from 'zod';

/**
 * Schema for the adapter-specific portion of lifecycle state `data` produced
 * by Pi's resumable lifecycle methods. Carries the basename
 * (including extension) of the Pi session file. The actual session bytes live
 * in the sandbox under `${sessionWorkDir}/.pi-sessions/<sessionFileName>` so
 * they survive cross-process resume via the sandbox snapshot.
 */
export const piResumeStateSchema = z
  .object({
    sessionFileName: z.string().optional(),
  })
  .passthrough();

export type PiResumeStateData = z.infer<typeof piResumeStateSchema>;

const PI_SESSIONS_DIR = '.pi-sessions';

/**
 * Copy the Pi session file from the host's local mirror to a stable location
 * inside the sandbox workspace. Called during resumable lifecycle methods so
 * the session survives a sandbox snapshot or a process handoff.
 */
export async function persistSessionFileToSandbox(args: {
  readonly sandbox: Experimental_SandboxSession;
  readonly sessionWorkDir: string;
  readonly hostSessionDir: string;
  readonly sessionFileName: string;
  readonly abortSignal?: AbortSignal;
}): Promise<void> {
  const hostPath = path.join(args.hostSessionDir, args.sessionFileName);
  const content = await readFile(hostPath);
  const remotePath = path.posix.join(
    args.sessionWorkDir,
    PI_SESSIONS_DIR,
    args.sessionFileName,
  );
  // Ensure the parent dir exists in the sandbox before writing.
  await args.sandbox.run({
    command: `mkdir -p ${path.posix.dirname(remotePath)}`,
    ...(args.abortSignal ? { abortSignal: args.abortSignal } : {}),
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
  readonly sessionWorkDir: string;
  readonly hostSessionDir: string;
  readonly sessionFileName: string;
  readonly abortSignal?: AbortSignal;
}): Promise<string | undefined> {
  const remotePath = path.posix.join(
    args.sessionWorkDir,
    PI_SESSIONS_DIR,
    args.sessionFileName,
  );
  const bytes = await args.sandbox.readBinaryFile({
    path: remotePath,
    ...(args.abortSignal ? { abortSignal: args.abortSignal } : {}),
  });
  if (!bytes) return undefined;
  await mkdir(args.hostSessionDir, { recursive: true });
  const hostPath = path.join(args.hostSessionDir, args.sessionFileName);
  await writeFile(hostPath, bytes);
  return hostPath;
}
