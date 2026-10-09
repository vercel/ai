import { spawn, type ChildProcess } from 'node:child_process';
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { WebSocket } from 'ws';

const FAILURE_SIGNAL =
  'ISSUE_16380_REPRODUCED: large OpenCode host-tool catalog prevented server launch with spawn E2BIG';
const BRIDGE_TOKEN = 'issue-16380-reproduction';
const repositoryRoot = fileURLToPath(new URL('../../../../', import.meta.url));

type Frame = {
  type?: string;
  error?: unknown;
};

async function main(): Promise<void> {
  if (process.platform !== 'linux') {
    throw new Error('Issue #16380 requires Linux MAX_ARG_STRLEN behavior.');
  }

  const tempDirectory = await mkdtemp(
    path.join(repositoryRoot, '.issue-16380-'),
  );
  const workdir = path.join(tempDirectory, 'workdir');
  const bridgeStateDir = path.join(tempDirectory, 'bridge-state');
  const bootstrapDir = path.join(tempDirectory, 'bootstrap');
  const fakeBinDirectory = path.join(bootstrapDir, 'node_modules', '.bin');
  const launchMarker = path.join(tempDirectory, 'opencode-launched.txt');
  let bridge: ChildProcess | undefined;
  let socket: WebSocket | undefined;

  try {
    await Promise.all([
      mkdir(workdir, { recursive: true }),
      mkdir(bridgeStateDir, { recursive: true }),
      mkdir(fakeBinDirectory, { recursive: true }),
    ]);

    const fakeOpencodePath = path.join(fakeBinDirectory, 'opencode');
    await writeFile(
      fakeOpencodePath,
      `#!/usr/bin/env node
import { writeFileSync } from 'node:fs';

writeFileSync(
  process.env.REPRO_16380_LAUNCH_MARKER,
  String(process.env.OPENCODE_CONFIG_CONTENT?.length ?? 0),
);
process.stdout.write(
  'opencode server listening on http://127.0.0.1:65534\\n',
);
setInterval(() => {}, 1_000);
`,
    );
    await chmod(fakeOpencodePath, 0o755);

    bridge = spawn(
      'pnpm',
      [
        '-C',
        path.join(repositoryRoot, 'packages/harness-opencode'),
        'exec',
        'tsx',
        'src/bridge/index.ts',
        '--workdir',
        workdir,
        '--bridge-state-dir',
        bridgeStateDir,
        '--bootstrap-dir',
        bootstrapDir,
      ],
      {
        cwd: repositoryRoot,
        detached: true,
        env: {
          ...process.env,
          BRIDGE_CHANNEL_TOKEN: BRIDGE_TOKEN,
          BRIDGE_WS_PORT: '0',
          REPRO_16380_LAUNCH_MARKER: launchMarker,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );

    const bridgeStderr: string[] = [];
    bridge.stderr?.on('data', chunk => {
      bridgeStderr.push(chunk.toString());
    });

    const port = await waitForBridgeReady(bridge);
    socket = await connectToBridge(port);

    const tools = createLargeToolCatalog();
    const serializedSchemas = JSON.stringify(tools);
    if (Buffer.byteLength(serializedSchemas) <= 128 * 1024) {
      throw new Error(
        `Reproduction catalog is too small: ${Buffer.byteLength(serializedSchemas)} bytes`,
      );
    }

    console.log(
      `host tools: ${tools.length}; serialized schemas: ${Buffer.byteLength(serializedSchemas)} bytes`,
    );

    const frames: Frame[] = [];
    socket.on('message', raw => {
      frames.push(JSON.parse(raw.toString()) as Frame);
    });
    await waitForFrame(frames, frame => frame.type === 'bridge-hello');

    socket.send(
      JSON.stringify({
        type: 'start',
        operation: 'prompt',
        prompt: 'Return the word ready.',
        permissionMode: 'allow-all',
        tools,
      }),
    );

    const outcome = await waitForLaunchOrError({
      frames,
      launchMarker,
      timeoutMs: 10_000,
    });

    if (outcome === 'launched') {
      const configLength = await readFile(launchMarker, 'utf8');
      console.log(
        `OpenCode launched successfully; OPENCODE_CONFIG_CONTENT was ${configLength} bytes.`,
      );
      return;
    }

    await new Promise(resolve => setTimeout(resolve, 50));
    if (await fileExists(launchMarker)) {
      console.log('OpenCode launched successfully.');
      return;
    }

    const errorText = frames
      .filter(frame => frame.type === 'error')
      .map(frame => stringify(frame.error))
      .join('\n');
    if (!errorText.includes('spawn E2BIG')) {
      throw new Error(
        `OpenCode failed for an unrelated reason: ${errorText || bridgeStderr.join('')}`,
      );
    }

    await waitForFrame(frames, frame => frame.type === 'finish');
    throw new Error(FAILURE_SIGNAL);
  } finally {
    socket?.close();
    if (bridge?.pid != null) {
      try {
        process.kill(-bridge.pid, 'SIGTERM');
      } catch {}
      await new Promise(resolve => setTimeout(resolve, 100));
      try {
        process.kill(-bridge.pid, 'SIGKILL');
      } catch {}
    }
    await rm(tempDirectory, { recursive: true, force: true });
  }
}

function createLargeToolCatalog() {
  return Array.from({ length: 170 }, (_, toolIndex) => ({
    name: `host_tool_${toolIndex}`,
    description: `Host tool ${toolIndex} with a complete JSON input schema.`,
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: Object.fromEntries(
        Array.from({ length: 10 }, (_, propertyIndex) => [
          `field_${propertyIndex}`,
          {
            type: 'string',
            description: `Input ${propertyIndex} for tool ${toolIndex}. ${'schema detail '.repeat(6)}`,
            enum: ['alpha', 'beta', 'gamma'],
          },
        ]),
      ),
      required: Array.from({ length: 10 }, (_, index) => `field_${index}`),
    },
  }));
}

function waitForBridgeReady(bridge: ChildProcess): Promise<number> {
  return new Promise((resolve, reject) => {
    let stdout = '';
    const timeout = setTimeout(
      () =>
        reject(new Error(`Timed out waiting for bridge readiness: ${stdout}`)),
      10_000,
    );
    bridge.once('error', error => {
      clearTimeout(timeout);
      reject(error);
    });
    bridge.once('exit', code => {
      clearTimeout(timeout);
      reject(new Error(`Bridge exited before readiness with code ${code}.`));
    });
    bridge.stdout?.on('data', chunk => {
      stdout += chunk.toString();
      for (const line of stdout.split('\n')) {
        if (!line.trim()) continue;
        try {
          const message = JSON.parse(line) as {
            type?: string;
            port?: number;
          };
          if (
            message.type === 'bridge-ready' &&
            typeof message.port === 'number'
          ) {
            clearTimeout(timeout);
            resolve(message.port);
            return;
          }
        } catch {}
      }
    });
  });
}

function connectToBridge(port: number): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(
      `ws://127.0.0.1:${port}/?agent_bridge_token=${BRIDGE_TOKEN}`,
    );
    socket.once('open', () => resolve(socket));
    socket.once('error', reject);
  });
}

async function waitForLaunchOrError({
  frames,
  launchMarker,
  timeoutMs,
}: {
  frames: Frame[];
  launchMarker: string;
  timeoutMs: number;
}): Promise<'launched' | 'error'> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await fileExists(launchMarker)) return 'launched';
    if (frames.some(frame => frame.type === 'error')) return 'error';
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error('Timed out waiting for OpenCode launch or bridge error.');
}

async function waitForFrame(
  frames: Frame[],
  predicate: (frame: Frame) => boolean,
): Promise<Frame> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const frame = frames.find(predicate);
    if (frame) return frame;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error('Timed out waiting for expected bridge frame.');
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

function stringify(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
