import { HarnessAgent, type HarnessAgentSession } from '@ai-sdk/harness/agent';
import type { HarnessV1NetworkSandboxSession } from '@ai-sdk/harness';
import { createOpenCode } from '@ai-sdk/harness-opencode';
import type { Experimental_SandboxProcess } from '@ai-sdk/provider-utils';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { LocalSandboxSession } from '../sandbox/local-sandbox';

const model = 'google/gemini-3.8-flash';
const failureSignal =
  'Issue #21565 reproduced: harness OpenCode could not run the Google model with a valid Google API key';

class LocalNetworkSandboxSession
  extends LocalSandboxSession
  implements HarnessV1NetworkSandboxSession
{
  readonly id = `issue-21565-${process.pid}`;
  readonly ports = [4000] as const;
  readonly defaultWorkingDirectory: string;
  private readonly children = new Set<ChildProcess>();

  constructor({ rootDirectory }: { rootDirectory: string }) {
    super({ rootDirectory });
    this.defaultWorkingDirectory = rootDirectory;
  }

  override async spawn({
    command,
    workingDirectory,
    env,
    abortSignal,
  }: {
    command: string;
    workingDirectory?: string;
    env?: Record<string, string>;
    abortSignal?: AbortSignal;
  }): Promise<Experimental_SandboxProcess> {
    abortSignal?.throwIfAborted();
    const childEnvironment = { ...process.env };
    for (const name of Object.keys(childEnvironment)) {
      if (
        name.endsWith('_API_KEY') ||
        name.endsWith('_AUTH_TOKEN') ||
        name.endsWith('_ACCESS_TOKEN') ||
        name === 'GITHUB_TOKEN' ||
        name === 'VERCEL_OIDC_TOKEN'
      ) {
        delete childEnvironment[name];
      }
    }
    const child = spawn('bash', ['-c', command], {
      cwd: workingDirectory ?? this.rootDirectory,
      env: {
        ...childEnvironment,
        HOME: this.rootDirectory,
        ...env,
      },
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    this.children.add(child);

    const stdout = Readable.toWeb(child.stdout!) as ReadableStream<Uint8Array>;
    const stderr = Readable.toWeb(child.stderr!) as ReadableStream<Uint8Array>;
    const exitPromise = new Promise<{ exitCode: number }>((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (code, signal) => {
        this.children.delete(child);
        resolve({
          exitCode:
            code ??
            (signal == null
              ? 1
              : 128 + (typeof signal === 'number' ? signal : 1)),
        });
      });
    });
    const kill = () => {
      if (child.pid != null) {
        try {
          process.kill(-child.pid, 'SIGTERM');
        } catch {}
      }
    };
    abortSignal?.addEventListener('abort', kill, { once: true });

    return {
      pid: child.pid,
      stdout,
      stderr,
      async wait() {
        try {
          return await exitPromise;
        } finally {
          abortSignal?.removeEventListener('abort', kill);
        }
      },
      async kill() {
        kill();
      },
    };
  }

  restricted() {
    return this;
  }

  async getPortEndpoint({
    port,
    protocol = 'http',
  }: {
    port: number;
    protocol?: 'http' | 'https' | 'ws';
  }) {
    return { url: `${protocol}://127.0.0.1:${port}` };
  }

  async getPortUrl(options: {
    port: number;
    protocol?: 'http' | 'https' | 'ws';
  }) {
    return (await this.getPortEndpoint(options)).url;
  }

  async stop() {
    for (const child of this.children) {
      if (child.pid != null) {
        try {
          process.kill(-child.pid, 'SIGTERM');
        } catch {}
      }
    }
    this.children.clear();
  }

  async destroy() {
    await this.stop();
    await rm(this.rootDirectory, { recursive: true, force: true });
  }
}

function errorText(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}\n${error.stack ?? ''}`;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

async function main(): Promise<void> {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? '';

  const agent = new HarnessAgent({
    harness: createOpenCode({
      auth: { GOOGLE_GENERATIVE_AI_API_KEY: apiKey },
    }),
    model,
  });

  await mkdir('/work/.tmp', { recursive: true });
  const rootDirectory = await mkdtemp('/work/.tmp/issue-21565-');
  const sandboxSession = new LocalNetworkSandboxSession({
    rootDirectory,
  });
  let session: HarnessAgentSession | undefined;

  try {
    session = await agent.createSession({ sandboxSession });
    const directOpenCode = await sandboxSession.run({
      command:
        './.ai-sdk-harness/.harness-bootstrap/opencode/node_modules/.bin/opencode run -m google/gemini-3.8-flash "Reply with exactly OK"',
      workingDirectory: rootDirectory,
      env: { GOOGLE_GENERATIVE_AI_API_KEY: apiKey },
    });
    if (
      directOpenCode.exitCode !== 0 ||
      !directOpenCode.stdout.includes('OK')
    ) {
      throw new Error(
        `Direct OpenCode control failed: ${directOpenCode.stderr || directOpenCode.stdout}`,
      );
    }

    const result = await agent.stream({
      session,
      prompt: 'Reply with exactly OK and do not use tools.',
    });
    let text = '';
    let streamError = '';
    for await (const part of result.fullStream) {
      if (part.type === 'text-delta') {
        text += part.text;
      }
      if (part.type === 'error') {
        streamError += errorText(part.error);
      }
    }
    if (
      /Google Generative AI API key is missing|GOOGLE_GENERATIVE_AI_API_KEY|authentication|unauthorized|API key|Model not found: google\/gemini-3\.8-flash/i.test(
        streamError,
      )
    ) {
      console.error(failureSignal);
      console.error(streamError);
      process.exitCode = 1;
      return;
    }
    if (!text.trim()) {
      throw new Error(
        `OpenCode returned no text from the Google model. Stream error: ${streamError}`,
      );
    }
    console.log(`OpenCode Google response: ${text.trim()}`);
  } catch (error) {
    const details = errorText(error);
    if (
      /Google Generative AI API key is missing|GOOGLE_GENERATIVE_AI_API_KEY|authentication|unauthorized|API key/i.test(
        details,
      )
    ) {
      console.error(failureSignal);
      console.error(details);
      process.exitCode = 1;
      return;
    }
    throw error;
  } finally {
    await session?.destroy();
    await sandboxSession.destroy();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
