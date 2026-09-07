import type {
  HarnessV1NetworkSandboxSession,
  HarnessV1SandboxProvider,
} from '@ai-sdk/harness';
import { HarnessAgent } from '@ai-sdk/harness/agent';
import { createPi, type PiHarnessSettings } from '@ai-sdk/harness-pi';
import type { Experimental_SandboxSession } from '@ai-sdk/provider-utils';
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const failureSignal =
  'ISSUE #20417: Pi extension node:fs could not see an existing session workspace file';

class LocalSandboxSession implements HarnessV1NetworkSandboxSession {
  readonly id = 'issue-20417-local-sandbox';
  readonly ports: readonly number[] = [];
  readonly description = 'Host-filesystem-backed local reproduction sandbox.';

  constructor(
    readonly defaultWorkingDirectory: string,
    private readonly homeDirectory: string,
  ) {}

  restricted(): Experimental_SandboxSession {
    return this;
  }

  async run({
    command,
    workingDirectory,
    env,
    abortSignal,
  }: Parameters<Experimental_SandboxSession['run']>[0]) {
    try {
      const result = await execFileAsync('/bin/bash', ['-c', command], {
        cwd: workingDirectory ?? this.defaultWorkingDirectory,
        env: {
          ...process.env,
          HOME: this.homeDirectory,
          ...env,
        },
        signal: abortSignal,
        maxBuffer: 10 * 1024 * 1024,
      });
      return { exitCode: 0, stdout: result.stdout, stderr: result.stderr };
    } catch (error) {
      const commandError = error as {
        code?: number;
        stdout?: string;
        stderr?: string;
      };
      return {
        exitCode: typeof commandError.code === 'number' ? commandError.code : 1,
        stdout: commandError.stdout ?? '',
        stderr: commandError.stderr ?? String(error),
      };
    }
  }

  async spawn(): Promise<never> {
    throw new Error('Local reproduction sandbox does not use spawn().');
  }

  async readFile({
    path,
  }: Parameters<Experimental_SandboxSession['readFile']>[0]) {
    const bytes = await this.readBinaryFile({ path });
    if (bytes == null) return null;
    return new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      },
    });
  }

  async readBinaryFile({
    path,
  }: Parameters<Experimental_SandboxSession['readBinaryFile']>[0]) {
    try {
      return new Uint8Array(await readFile(path));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  async readTextFile({
    path,
    encoding = 'utf-8',
    startLine,
    endLine,
  }: Parameters<Experimental_SandboxSession['readTextFile']>[0]) {
    const bytes = await this.readBinaryFile({ path });
    if (bytes == null) return null;
    const lines = Buffer.from(bytes)
      .toString(encoding as BufferEncoding)
      .split('\n');
    return lines.slice((startLine ?? 1) - 1, endLine).join('\n');
  }

  async writeFile({
    path,
    content,
  }: Parameters<Experimental_SandboxSession['writeFile']>[0]) {
    const reader = content.getReader();
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    await this.writeBinaryFile({
      path,
      content: Buffer.concat(chunks.map(chunk => Buffer.from(chunk))),
    });
  }

  async writeBinaryFile({
    path,
    content,
  }: Parameters<Experimental_SandboxSession['writeBinaryFile']>[0]) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content);
  }

  async writeTextFile({
    path,
    content,
    encoding = 'utf-8',
  }: Parameters<Experimental_SandboxSession['writeTextFile']>[0]) {
    await this.writeBinaryFile({
      path,
      content: Buffer.from(content, encoding as BufferEncoding),
    });
  }

  async getPortEndpoint(): Promise<never> {
    throw new Error('Local reproduction sandbox does not expose ports.');
  }

  async getPortUrl(): Promise<never> {
    throw new Error('Local reproduction sandbox does not expose ports.');
  }

  async stop(): Promise<void> {}

  async destroy(): Promise<void> {}
}

async function main(): Promise<void> {
  const sandboxRoot = mkdtempSync(join(tmpdir(), 'issue-20417-'));
  const homeDirectory = join(sandboxRoot, 'home');
  const sessionWorkDir = join(sandboxRoot, 'repo');
  const graphPath = join(sessionWorkDir, 'graphify-out', 'graph.json');
  const skillPath = join(
    sessionWorkDir,
    '.agents',
    'skills',
    'probe',
    'SKILL.md',
  );

  mkdirSync(dirname(graphPath), { recursive: true });
  mkdirSync(dirname(skillPath), { recursive: true });
  mkdirSync(homeDirectory, { recursive: true });
  writeFileSync(graphPath, '{}');
  writeFileSync(
    skillPath,
    '---\nname: probe\ndescription: mirror probe\n---\n',
  );

  const beforeMount = existsSync(graphPath);
  let extensionObservation:
    | {
        graphVisibleThroughNodeFs: boolean;
        graphVisibleOnHost: boolean;
        mirroredSkillVisibleThroughNodeFs: boolean;
      }
    | undefined;

  const extensionFactory: NonNullable<
    PiHarnessSettings['extensionFactories']
  >[number] = () => {
    extensionObservation = {
      graphVisibleThroughNodeFs: existsSync(graphPath),
      graphVisibleOnHost: existsSync(
        `/proc/self/root${graphPath.startsWith('/') ? graphPath : `/${graphPath}`}`,
      ),
      mirroredSkillVisibleThroughNodeFs: existsSync(skillPath),
    };
  };

  const sandboxSession = new LocalSandboxSession(sandboxRoot, homeDirectory);
  const sandboxProvider: HarnessV1SandboxProvider = {
    specificationVersion: 'harness-sandbox-v1',
    providerId: 'issue-20417-local',
    async createSession(options) {
      await options?.onFirstCreate?.(sandboxSession.restricted(), {
        ...(options.abortSignal ? { abortSignal: options.abortSignal } : {}),
      });
      return sandboxSession;
    },
  };

  const agent = new HarnessAgent({
    harness: createPi({
      auth: {},
      extensionFactories: [extensionFactory],
    }),
    sandbox: sandboxProvider,
    sandboxConfig: { workDir: 'repo' },
  });

  let session: Awaited<ReturnType<typeof agent.createSession>> | undefined;
  try {
    session = await agent.createSession({ sessionId: 'vfs-repro' });

    console.log(
      JSON.stringify({
        sessionWorkDir,
        beforeMount,
        extensionObservation,
      }),
    );

    if (!beforeMount) {
      throw new Error('Reproduction setup did not create graph.json.');
    }
    if (extensionObservation == null) {
      throw new Error('Pi did not execute the inline extension factory.');
    }
    if (!extensionObservation.graphVisibleOnHost) {
      throw new Error('Host filesystem probe could not see graph.json.');
    }
    if (!extensionObservation.mirroredSkillVisibleThroughNodeFs) {
      throw new Error('Pi config mirror did not expose the probe skill.');
    }
    if (!extensionObservation.graphVisibleThroughNodeFs) {
      throw new Error(failureSignal);
    }
  } finally {
    await session?.destroy();
    await rm(sandboxRoot, { recursive: true, force: true });
  }
}

main();
