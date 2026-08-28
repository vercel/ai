import { spawn as spawnChild } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import {
  HarnessAgent,
  type HarnessAgentResumeSessionState,
} from '@ai-sdk/harness/agent';
import type { HarnessV1NetworkSandboxSession } from '@ai-sdk/harness';
import { createDeepAgents } from '@ai-sdk/harness-deepagents';
import type {
  Experimental_SandboxProcess,
  Experimental_SandboxSession,
} from '@ai-sdk/provider-utils';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const relativeScriptPath =
  'src/reproduction/issue-19693-deepagents-stop-resume.ts';
const stage = process.argv
  .find(value => value.startsWith('--stage='))
  ?.slice(8);
const root =
  process.env.ISSUE_19693_ROOT ?? join(repoRoot, '.tmp-issue-19693-default');
const bridgePort = Number(process.env.ISSUE_19693_BRIDGE_PORT ?? 43891);
const modelPort = Number(process.env.ISSUE_19693_MODEL_PORT ?? 43892);
const statePath = join(root, 'resume-state.json');
const sessionId = 'issue-19693-session';

class LocalNetworkSandbox {
  readonly id = 'issue-19693-local-sandbox';
  readonly defaultWorkingDirectory = root;
  readonly ports = [bridgePort];
  readonly description = 'Local process sandbox for issue #19693 reproduction.';

  restricted = (): Experimental_SandboxSession => this;

  getPortEndpoint = async ({ port }: { port: number }) => ({
    url: `ws://127.0.0.1:${port}`,
  });

  getPortUrl = async ({ port }: { port: number }) => `ws://127.0.0.1:${port}`;

  stop = async () => {};
  destroy = async () => {};

  run = async ({
    command,
    workingDirectory = root,
    env,
    abortSignal,
  }: {
    command: string;
    workingDirectory?: string;
    env?: Record<string, string>;
    abortSignal?: AbortSignal;
  }) => {
    abortSignal?.throwIfAborted();

    if (command === 'pnpm install --frozen-lockfile --store-dir .pnpm-store') {
      const nodeModules = join(workingDirectory, 'node_modules');
      await rm(nodeModules, { force: true, recursive: true });
      await symlink(
        join(repoRoot, 'packages/harness-deepagents/node_modules'),
        nodeModules,
        'dir',
      );
      return { exitCode: 0, stdout: '', stderr: '' };
    }

    return new Promise<{ exitCode: number; stdout: string; stderr: string }>(
      resolve => {
        const child = spawnChild('/bin/bash', ['-c', command], {
          cwd: workingDirectory,
          env: {
            ...process.env,
            HOME: join(root, 'home'),
            ...env,
          },
        });
        let stdout = '';
        let stderr = '';
        child.stdout?.setEncoding('utf8').on('data', chunk => {
          stdout += chunk;
        });
        child.stderr?.setEncoding('utf8').on('data', chunk => {
          stderr += chunk;
        });
        const onAbort = () => child.kill('SIGKILL');
        abortSignal?.addEventListener('abort', onAbort, { once: true });
        child.once('close', code => {
          abortSignal?.removeEventListener('abort', onAbort);
          resolve({ exitCode: code ?? 1, stdout, stderr });
        });
      },
    );
  };

  spawn = async ({
    command,
    workingDirectory = root,
    env,
    abortSignal,
  }: {
    command: string;
    workingDirectory?: string;
    env?: Record<string, string>;
    abortSignal?: AbortSignal;
  }): Promise<Experimental_SandboxProcess> => {
    abortSignal?.throwIfAborted();
    const child = spawnChild('/bin/bash', ['-c', command], {
      cwd: workingDirectory,
      env: {
        ...process.env,
        HOME: join(root, 'home'),
        ...env,
      },
    });
    const wait = new Promise<{ exitCode: number }>((resolve, reject) => {
      const onAbort = () => {
        child.kill('SIGKILL');
        reject(
          abortSignal?.reason ?? new DOMException('Aborted', 'AbortError'),
        );
      };
      abortSignal?.addEventListener('abort', onAbort, { once: true });
      child.once('close', code => {
        abortSignal?.removeEventListener('abort', onAbort);
        resolve({ exitCode: code ?? 1 });
      });
    });

    return {
      pid: child.pid,
      stdout: Readable.toWeb(child.stdout!) as ReadableStream<Uint8Array>,
      stderr: Readable.toWeb(child.stderr!) as ReadableStream<Uint8Array>,
      wait: () => wait,
      kill: async () => {
        if (child.exitCode == null) child.kill('SIGKILL');
      },
    };
  };

  readBinaryFile = async ({ path }: { path: string }) => {
    try {
      return new Uint8Array(await readFile(path));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  };

  readTextFile = async ({ path }: { path: string }) => {
    try {
      return await readFile(path, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  };

  readFile = async ({ path }: { path: string }) => {
    const bytes = await this.readBinaryFile({ path });
    if (bytes == null) return null;
    return new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      },
    });
  };

  writeBinaryFile = async ({
    path,
    content,
  }: {
    path: string;
    content: Uint8Array;
  }) => {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content);
  };

  writeTextFile = async ({
    path,
    content,
  }: {
    path: string;
    content: string;
  }) => {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content, 'utf8');
  };

  writeFile = async ({
    path,
    content,
  }: {
    path: string;
    content: ReadableStream<Uint8Array>;
  }) => {
    const chunks: Uint8Array[] = [];
    const reader = content.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    await this.writeBinaryFile({
      path,
      content: Buffer.concat(chunks),
    });
  };
}

function createAgent(sandboxSession: HarnessV1NetworkSandboxSession) {
  return new HarnessAgent({
    harness: createDeepAgents({
      model: 'anthropic:mock-model',
      port: bridgePort,
      portEndpoint: { url: `ws://127.0.0.1:${bridgePort}` },
      auth: {
        ANTHROPIC_API_KEY: 'test-key',
        ANTHROPIC_BASE_URL: `http://127.0.0.1:${modelPort}`,
      },
    }),
  });
}

async function startMockAnthropic(): Promise<Server> {
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
      messages?: unknown;
    };
    const messages = JSON.stringify(body.messages ?? []);
    const asksForName = messages.includes('What is my name?');
    const hasEarlierContext =
      asksForName && messages.includes('My name is Felix.');
    const text = asksForName
      ? hasEarlierContext
        ? 'Felix'
        : 'UNKNOWN'
      : 'Acknowledged';

    response.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    });
    const send = (event: string, data: unknown) => {
      response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };
    send('message_start', {
      type: 'message_start',
      message: {
        id: 'msg_mock',
        type: 'message',
        role: 'assistant',
        model: 'mock-model',
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 1, output_tokens: 0 },
      },
    });
    send('content_block_start', {
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'text', text: '' },
    });
    send('content_block_delta', {
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'text_delta', text },
    });
    send('content_block_stop', { type: 'content_block_stop', index: 0 });
    send('message_delta', {
      type: 'message_delta',
      delta: { stop_reason: 'end_turn', stop_sequence: null },
      usage: { output_tokens: 1 },
    });
    send('message_stop', { type: 'message_stop' });
    response.end();
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(modelPort, '127.0.0.1', resolve);
  });
  return server;
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close(error => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

async function runDetachControl(): Promise<void> {
  const server = await startMockAnthropic();
  const sandbox = new LocalNetworkSandbox() as HarnessV1NetworkSandboxSession;
  try {
    const firstAgent = createAgent(sandbox);
    const firstSession = await firstAgent.createSession({
      sessionId: `${sessionId}-detach`,
      sandboxSession: sandbox,
    });
    await firstAgent.generate({
      session: firstSession,
      prompt: 'My name is Felix. Remember it.',
    });
    const resumeState = await firstSession.detach();

    const secondAgent = createAgent(sandbox);
    const secondSession = await secondAgent.createSession({
      sessionId: `${sessionId}-detach`,
      resumeFrom: resumeState,
      sandboxSession: sandbox,
    });
    const second = await secondAgent.generate({
      session: secondSession,
      prompt: 'What is my name? Answer in one word.',
    });
    await secondSession.destroy();
    if (second.text !== 'Felix') {
      throw new Error(`Detach control unexpectedly returned: ${second.text}`);
    }
    console.log('Detach/reattach control retained context.');
  } finally {
    await closeServer(server);
  }
}

async function runStopFirstProcess(): Promise<void> {
  const server = await startMockAnthropic();
  const sandbox = new LocalNetworkSandbox() as HarnessV1NetworkSandboxSession;
  try {
    const agent = createAgent(sandbox);
    const session = await agent.createSession({
      sessionId,
      sandboxSession: sandbox,
    });
    await agent.generate({
      session,
      prompt: 'My name is Felix. Remember it.',
    });
    const resumeState = await session.stop();
    await writeFile(statePath, JSON.stringify(resumeState), 'utf8');
    console.log(`Stopped first host process ${process.pid}.`);
  } finally {
    await closeServer(server);
  }
}

async function runStopSecondProcess(): Promise<void> {
  const server = await startMockAnthropic();
  const sandbox = new LocalNetworkSandbox() as HarnessV1NetworkSandboxSession;
  try {
    const resumeState = JSON.parse(
      await readFile(statePath, 'utf8'),
    ) as HarnessAgentResumeSessionState;
    const agent = createAgent(sandbox);
    const session = await agent.createSession({
      sessionId,
      resumeFrom: resumeState,
      sandboxSession: sandbox,
    });
    const result = await agent.generate({
      session,
      prompt: 'What is my name? Answer in one word.',
    });
    await session.destroy();
    if (result.text !== 'Felix') {
      console.error(
        `ISSUE_19693_REPRODUCED: resumed Deep Agents session lost pre-stop conversation context (received ${JSON.stringify(result.text)})`,
      );
      process.exitCode = 1;
      return;
    }
    console.log('Stop/resume retained context across host processes.');
  } finally {
    await closeServer(server);
  }
}

async function runChild(childStage: string, env: NodeJS.ProcessEnv) {
  return new Promise<number>((resolve, reject) => {
    const child = spawnChild(
      'pnpm',
      ['exec', 'tsx', relativeScriptPath, `--stage=${childStage}`],
      {
        cwd: join(repoRoot, 'examples/ai-functions'),
        env,
        stdio: 'inherit',
      },
    );
    child.once('error', reject);
    child.once('close', code => resolve(code ?? 1));
  });
}

async function main(): Promise<void> {
  if (stage === 'detach') return runDetachControl();
  if (stage === 'stop-first') return runStopFirstProcess();
  if (stage === 'stop-second') return runStopSecondProcess();

  const runRoot = join(repoRoot, `.tmp-issue-19693-${process.pid}`);
  const env = {
    ...process.env,
    ISSUE_19693_ROOT: runRoot,
    ISSUE_19693_BRIDGE_PORT: String(44000 + (process.pid % 500)),
    ISSUE_19693_MODEL_PORT: String(44500 + (process.pid % 500)),
  };
  await rm(runRoot, { force: true, recursive: true });
  await mkdir(runRoot, { recursive: true });
  try {
    for (const childStage of ['detach', 'stop-first', 'stop-second']) {
      const exitCode = await runChild(childStage, env);
      if (exitCode !== 0) {
        process.exitCode = exitCode;
        return;
      }
    }
  } finally {
    await rm(runRoot, { force: true, recursive: true });
  }
}

await main();
