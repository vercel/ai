import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { HarnessAgent } from '@ai-sdk/harness/agent';
import { createOpenCode } from '@ai-sdk/harness-opencode';

const MODEL = process.env.MODEL ?? 'anthropic/claude-haiku-4-5';
const FAILURE_SIGNAL =
  'ISSUE_21680_REPRODUCED: aborted OpenCode turn contaminated the next turn';

const absolutePath = (root: string, path: string) =>
  isAbsolute(path) ? path : resolve(root, path);

function startProcess(
  command: string,
  cwd: string,
  env: Record<string, string> | undefined,
) {
  return spawn(command, {
    cwd,
    env: { ...process.env, ...env },
    shell: '/bin/bash',
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function killProcessTree(child: ReturnType<typeof startProcess>) {
  try {
    process.kill(-child.pid!, 'SIGTERM');
  } catch {}
}

async function createLocalSandboxSession(root: string) {
  await mkdir(root, { recursive: true });
  const children = new Set<ReturnType<typeof startProcess>>();
  const track = (child: ReturnType<typeof startProcess>) => {
    children.add(child);
    child.once('exit', () => children.delete(child));
    return child;
  };
  const stopChildren = () => {
    for (const child of children) killProcessTree(child);
  };

  const session = {
    id: randomUUID(),
    description: `Local host at ${root}`,
    defaultWorkingDirectory: root,
    ports: [0],
    getPortEndpoint: async ({
      port,
      protocol = 'ws',
    }: {
      port: number;
      protocol?: string;
    }) => ({ url: `${protocol}://127.0.0.1:${port}` }),
    getPortUrl: async ({
      port,
      protocol = 'ws',
    }: {
      port: number;
      protocol?: string;
    }) => `${protocol}://127.0.0.1:${port}`,
    readFile: async ({ path }: { path: string }) => {
      try {
        return Readable.toWeb(createReadStream(absolutePath(root, path)));
      } catch {
        return null;
      }
    },
    readBinaryFile: async ({ path }: { path: string }) => {
      try {
        return new Uint8Array(await readFile(absolutePath(root, path)));
      } catch {
        return null;
      }
    },
    readTextFile: async ({
      path,
      startLine,
      endLine,
    }: {
      path: string;
      startLine?: number;
      endLine?: number;
    }) => {
      try {
        const text = await readFile(absolutePath(root, path), 'utf8');
        if (startLine == null && endLine == null) return text;
        const lines = text.split('\n');
        return lines
          .slice((startLine ?? 1) - 1, endLine ?? lines.length)
          .join('\n');
      } catch {
        return null;
      }
    },
    writeFile: async ({
      path,
      content,
    }: {
      path: string;
      content: AsyncIterable<Uint8Array>;
    }) => {
      const destination = absolutePath(root, path);
      await mkdir(dirname(destination), { recursive: true });
      const chunks: Buffer[] = [];
      for await (const chunk of content) chunks.push(Buffer.from(chunk));
      await writeFile(destination, Buffer.concat(chunks));
    },
    writeBinaryFile: async ({
      path,
      content,
    }: {
      path: string;
      content: Uint8Array;
    }) => {
      const destination = absolutePath(root, path);
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, content);
    },
    writeTextFile: async ({
      path,
      content,
    }: {
      path: string;
      content: string;
    }) => {
      const destination = absolutePath(root, path);
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, content, 'utf8');
    },
    spawn: async ({
      command,
      workingDirectory,
      env,
      abortSignal,
    }: {
      command: string;
      workingDirectory?: string;
      env?: Record<string, string>;
      abortSignal?: AbortSignal;
    }) => {
      const child = track(
        startProcess(
          command,
          workingDirectory ? absolutePath(root, workingDirectory) : root,
          env,
        ),
      );
      abortSignal?.addEventListener('abort', () => killProcessTree(child), {
        once: true,
      });
      return {
        pid: child.pid!,
        stdout: Readable.toWeb(child.stdout!),
        stderr: Readable.toWeb(child.stderr!),
        wait: () =>
          new Promise<{ exitCode: number }>(resolveWait => {
            child.once('close', code => resolveWait({ exitCode: code ?? 1 }));
          }),
        kill: async () => killProcessTree(child),
      };
    },
    run: async ({
      command,
      workingDirectory,
      env,
      abortSignal,
    }: {
      command: string;
      workingDirectory?: string;
      env?: Record<string, string>;
      abortSignal?: AbortSignal;
    }) =>
      new Promise<{
        exitCode: number;
        stdout: string;
        stderr: string;
      }>(resolveRun => {
        const child = track(
          startProcess(
            command,
            workingDirectory ? absolutePath(root, workingDirectory) : root,
            env,
          ),
        );
        let stdout = '';
        let stderr = '';
        child.stdout!.on('data', data => (stdout += data));
        child.stderr!.on('data', data => (stderr += data));
        abortSignal?.addEventListener('abort', () => killProcessTree(child), {
          once: true,
        });
        child.once('close', code =>
          resolveRun({ exitCode: code ?? 1, stdout, stderr }),
        );
      }),
    stop: async () => stopChildren(),
    destroy: async () => stopChildren(),
  };
  session.restricted = () => session;
  return session;
}

type TurnResult = {
  text: string;
  partTypes: string[];
  errors: string[];
};

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

async function main() {
  const agent = new HarnessAgent({
    harness: createOpenCode({ auth: {}, provider: MODEL.split('/')[0] }),
    model: MODEL,
    permissionMode: 'allow-all',
  });
  const sandboxRoot = await mkdtemp(
    join(process.cwd(), '.harness-opencode-abort-'),
  );
  const sandboxSession = await createLocalSandboxSession(sandboxRoot);
  let session: Awaited<ReturnType<(typeof agent)['createSession']>> | undefined;

  const runTurn = async (
    prompt: string,
    abortAfterCharacters?: number,
  ): Promise<TurnResult> => {
    const controller = new AbortController();
    const result = await agent.stream({
      session: session!,
      prompt,
      abortSignal: controller.signal,
    });
    const partTypes: string[] = [];
    const errors: string[] = [];
    let text = '';
    try {
      for await (const part of result.fullStream) {
        partTypes.push(part.type);
        if (part.type === 'text-delta') text += part.text;
        if (part.type === 'error') {
          errors.push(errorMessage(part.error));
        }
        if (
          abortAfterCharacters != null &&
          !controller.signal.aborted &&
          text.length >= abortAfterCharacters
        ) {
          controller.abort();
        }
      }
    } catch (error) {
      errors.push(errorMessage(error));
    }
    return { text, partTypes, errors };
  };

  try {
    session = await agent.createSession({
      sandboxSession: sandboxSession as never,
    });
    const first = await runTurn(
      'Write a 600-word short story about a lighthouse keeper.',
      300,
    );
    console.log(
      'turn 1:',
      JSON.stringify(first.text.slice(0, 80)),
      first.errors,
    );
    await new Promise(resolveWait => setTimeout(resolveWait, 2_000));

    const second = await runTurn(
      'Reply with exactly one word, with no punctuation: banana',
    );
    console.log('turn 2 parts:', [...new Set(second.partTypes)].join(', '));
    console.log('turn 2 text:', JSON.stringify(second.text));
    console.log('turn 2 errors:', JSON.stringify(second.errors));

    const eventStreamFailure = second.errors.some(error =>
      error.includes('OpenCode event stream ended before the turn settled.'),
    );
    const secondReply = second.text.trim().toLowerCase();
    const leakedOrMissingReply =
      second.text.length > 0 ? secondReply !== 'banana' : eventStreamFailure;

    if (eventStreamFailure || leakedOrMissingReply) {
      throw new Error(FAILURE_SIGNAL);
    }
    if (secondReply !== 'banana') {
      throw new Error(
        `Expected the second turn to reply "banana", received ${JSON.stringify(second.text)}.`,
      );
    }
  } finally {
    await session?.destroy().catch(() => {});
    await sandboxSession.destroy();
    await rm(sandboxRoot, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(errorMessage(error));
  process.exitCode = 1;
});
