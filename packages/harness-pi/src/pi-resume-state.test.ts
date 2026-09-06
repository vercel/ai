import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Experimental_SandboxSession } from '@ai-sdk/provider-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  persistSessionFileToSandbox,
  piResumeStateSchema,
  pullSessionFileFromSandbox,
  resolvePiPrivateSessionDirectory,
  safePiSessionFileName,
} from './pi-resume-state';

type ReadCalls = string[];
type WriteCalls = Array<{ path: string; content: Uint8Array }>;

function makeSandbox(
  input: {
    readonly readBinary?: (path: string) => Uint8Array | undefined;
  } = {},
): {
  readonly sandbox: Experimental_SandboxSession;
  readonly run: ReturnType<typeof vi.fn>;
  readonly readBinaryFile: ReturnType<typeof vi.fn>;
  readonly writeBinaryFile: ReturnType<typeof vi.fn>;
  readonly readCalls: ReadCalls;
  readonly writeCalls: WriteCalls;
} {
  const readCalls: ReadCalls = [];
  const writeCalls: WriteCalls = [];

  const run = vi.fn();
  const readBinaryFile = vi.fn(async ({ path }: { path: string }) => {
    readCalls.push(path);
    return input.readBinary?.(path);
  });
  const writeBinaryFile = vi.fn(
    async ({ path, content }: { path: string; content: Uint8Array }) => {
      writeCalls.push({ path, content });
    },
  );

  const sandbox = {
    description: 'mock',
    run,
    readBinaryFile,
    readFile: vi.fn(),
    readTextFile: vi.fn(),
    writeFile: vi.fn(),
    writeBinaryFile,
    writeTextFile: vi.fn(),
    spawn: vi.fn(),
  } as unknown as Experimental_SandboxSession;

  return {
    sandbox,
    run,
    readBinaryFile,
    writeBinaryFile,
    readCalls,
    writeCalls,
  };
}

let hostSessionDir: string;

beforeEach(() => {
  hostSessionDir = mkdtempSync(path.join(tmpdir(), 'pi-resume-state-'));
});

afterEach(() => {
  rmSync(hostSessionDir, { recursive: true, force: true });
});

describe('safePiSessionFileName', () => {
  it('accepts current and legacy Pi session file basenames', () => {
    expect(
      safePiSessionFileName(
        '2026-06-26T19-14-21-123Z_01931337-1111-7222-8333-abcdefabcdef.jsonl',
      ),
    ).toBe(
      '2026-06-26T19-14-21-123Z_01931337-1111-7222-8333-abcdefabcdef.jsonl',
    );
    expect(safePiSessionFileName('session_123.json')).toBe('session_123.json');
  });

  it('rejects traversal, separators, shell-sensitive names, and other extensions', () => {
    const unsafeNames = [
      '../session.jsonl',
      '..',
      '.',
      '/tmp/session.jsonl',
      'nested/session.jsonl',
      'nested\\session.jsonl',
      'session name.jsonl',
      'session;touch.jsonl',
      'session$(touch).jsonl',
      'session.txt',
      '.session.jsonl',
    ];

    for (const sessionFileName of unsafeNames) {
      expect(() => safePiSessionFileName(sessionFileName)).toThrow(
        'Invalid Pi session file name',
      );
    }
  });
});

describe('piResumeStateSchema', () => {
  it('accepts safe session files and preserves unknown fields', () => {
    expect(
      piResumeStateSchema.parse({
        sessionFileName: 'session.jsonl',
        other: true,
      }),
    ).toEqual({
      sessionFileName: 'session.jsonl',
      other: true,
    });
  });

  it('rejects unsafe session files', () => {
    expect(
      piResumeStateSchema.safeParse({
        sessionFileName: '../session.jsonl',
      }).success,
    ).toBe(false);
  });
});

describe('resolvePiPrivateSessionDirectory', () => {
  it('creates a stable private directory outside the session workspace', () => {
    const privateSessionDir = resolvePiPrivateSessionDirectory({
      sandboxHomeDir: '/sandbox/home',
      sessionWorkDir: '/sandbox/work/pi-s1',
      sessionId: '../unsafe/session-id',
    });

    expect(privateSessionDir).toMatch(
      /^\/sandbox\/home\/\.ai-sdk\/harness-pi\/[a-f0-9]{64}$/,
    );
    expect(privateSessionDir).toBe(
      resolvePiPrivateSessionDirectory({
        sandboxHomeDir: '/sandbox/home',
        sessionWorkDir: '/sandbox/work/pi-s1',
        sessionId: '../unsafe/session-id',
      }),
    );
  });

  it('rejects a private directory inside the session workspace', () => {
    expect(() =>
      resolvePiPrivateSessionDirectory({
        sandboxHomeDir: '/sandbox/work/pi-s1',
        sessionWorkDir: '/sandbox/work/pi-s1',
        sessionId: 'session-1',
      }),
    ).toThrow(/must be outside sessionWorkDir/);
  });
});

describe('pullSessionFileFromSandbox', () => {
  it('copies a safe sandbox session file into the host session directory', async () => {
    const bytes = new TextEncoder().encode('session data');
    const sandbox = makeSandbox({
      readBinary: requestedPath =>
        requestedPath ===
        '/sandbox/home/.ai-sdk/harness-pi/session-key/session.jsonl'
          ? bytes
          : undefined,
    });

    const hostPath = await pullSessionFileFromSandbox({
      sandbox: sandbox.sandbox,
      privateSessionDir: '/sandbox/home/.ai-sdk/harness-pi/session-key',
      hostSessionDir,
      sessionFileName: 'session.jsonl',
    });

    expect(hostPath).toBe(path.join(hostSessionDir, 'session.jsonl'));
    expect(readFileSync(hostPath!, 'utf8')).toBe('session data');
    expect(sandbox.readCalls).toEqual([
      '/sandbox/home/.ai-sdk/harness-pi/session-key/session.jsonl',
    ]);
  });

  it('rejects unsafe filenames before reading from the sandbox', async () => {
    const sandbox = makeSandbox();

    await expect(
      pullSessionFileFromSandbox({
        sandbox: sandbox.sandbox,
        privateSessionDir: '/sandbox/home/.ai-sdk/harness-pi/session-key',
        hostSessionDir,
        sessionFileName: '../session.jsonl',
      }),
    ).rejects.toThrow('Invalid Pi session file name');

    expect(sandbox.readBinaryFile).not.toHaveBeenCalled();
  });
});

describe('persistSessionFileToSandbox', () => {
  it('copies a safe host session file into the sandbox session directory', async () => {
    const sandbox = makeSandbox();
    writeFileSync(path.join(hostSessionDir, 'session.jsonl'), 'session data');

    await persistSessionFileToSandbox({
      sandbox: sandbox.sandbox,
      privateSessionDir: '/sandbox/home/.ai-sdk/harness-pi/session-key',
      hostSessionDir,
      sessionFileName: 'session.jsonl',
    });

    expect(sandbox.writeCalls[0]?.path).toBe(
      '/sandbox/home/.ai-sdk/harness-pi/session-key/session.jsonl',
    );
    expect(Buffer.from(sandbox.writeCalls[0]!.content).toString('utf8')).toBe(
      'session data',
    );
  });

  it('does not place session state in the agent workspace', async () => {
    const sandbox = makeSandbox();
    writeFileSync(path.join(hostSessionDir, 'session.jsonl'), 'session data');

    await persistSessionFileToSandbox({
      sandbox: sandbox.sandbox,
      privateSessionDir: '/home/vercel-sandbox/.ai-sdk/harness-pi/session-key',
      hostSessionDir,
      sessionFileName: 'session.jsonl',
    });

    expect(sandbox.writeCalls[0]?.path).toBe(
      '/home/vercel-sandbox/.ai-sdk/harness-pi/session-key/session.jsonl',
    );
    expect(sandbox.writeCalls[0]?.path).not.toContain('/vercel/sandbox/pi-s1');
    expect(Buffer.from(sandbox.writeCalls[0]!.content).toString('utf8')).toBe(
      'session data',
    );
  });

  it('rejects unsafe filenames before writing to the sandbox', async () => {
    const sandbox = makeSandbox();

    await expect(
      persistSessionFileToSandbox({
        sandbox: sandbox.sandbox,
        privateSessionDir: '/sandbox/home/.ai-sdk/harness-pi/session-key',
        hostSessionDir,
        sessionFileName: '../session.jsonl',
      }),
    ).rejects.toThrow('Invalid Pi session file name');

    expect(sandbox.writeBinaryFile).not.toHaveBeenCalled();
  });
});
