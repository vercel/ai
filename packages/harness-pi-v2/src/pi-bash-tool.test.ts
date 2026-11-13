import { createJustBashNetworkSandboxSession } from '@ai-sdk/sandbox-just-bash';
import type { BashToolInput } from '@earendil-works/pi-coding-agent';
import { describe, expect, test } from 'vitest';
import { createPiBashTool } from './pi-bash-tool';

async function setup() {
  const session = await createJustBashNetworkSandboxSession();
  const workDir = session.defaultWorkingDirectory;
  const updates: string[] = [];
  const tool = createPiBashTool({ session, workDir });
  const bash = ({
    input,
    abortSignal,
  }: {
    input: BashToolInput;
    abortSignal?: AbortSignal;
  }) =>
    tool.execute(
      'call-1',
      input,
      abortSignal ?? new AbortController().signal,
      partial =>
        updates.push(
          partial.content.map(part => (part as { text: string }).text).join(''),
        ),
    );
  return { session, workDir, bash, updates };
}

function text(result: { content: Array<{ type: string; text?: string }> }) {
  return result.content.map(part => part.text).join('');
}

describe('createPiBashTool', () => {
  test('returns the combined output', async () => {
    const { bash, updates } = await setup();

    const result = await bash({ input: { command: 'echo out; echo err >&2' } });

    expect(text(result)).toBe('out\nerr\n');
    expect(result.isError).toBeUndefined();
    expect(updates.at(-1)).toBe('out\nerr\n');
  });

  test('reports empty output and nonzero exit codes', async () => {
    const { bash } = await setup();

    expect(text(await bash({ input: { command: 'true' } }))).toBe(
      '(no output)',
    );
    const failed = await bash({ input: { command: 'echo nope; exit 3' } });
    expect(failed).toMatchObject({ isError: true });
    expect(text(failed)).toBe('nope\n\n\nCommand exited with code 3');
  });

  test('validates the timeout', async () => {
    const { bash } = await setup();

    await expect(
      bash({ input: { command: 'true', timeout: 0 } }),
    ).rejects.toThrow('Invalid timeout: must be a finite number of seconds');
  });

  test('fails when the timeout elapses', async () => {
    const { bash } = await setup();

    await expect(
      bash({ input: { command: 'sleep 5', timeout: 0.2 } }),
    ).rejects.toThrow('Command timed out after 0.2 seconds');
  });

  test('fails when aborted', async () => {
    const { bash } = await setup();
    const abortController = new AbortController();
    abortController.abort();

    await expect(
      bash({
        input: { command: 'echo hi' },
        abortSignal: abortController.signal,
      }),
    ).rejects.toThrow('Command aborted');
  });

  test('writes truncated output to a file in the sandbox', async () => {
    const { session, bash } = await setup();

    const result = await bash({ input: { command: 'seq 1 3000' } });

    expect(text(result)).toMatch(
      /\n3000\n\n\[Showing lines 1001-3000 of 3000\. Full output: \/tmp\/pi-bash-call-1\.log\]$/,
    );
    expect(result.details?.fullOutputPath).toBe('/tmp/pi-bash-call-1.log');
    const full = await session.readTextFile({
      path: '/tmp/pi-bash-call-1.log',
    });
    expect(full?.endsWith('2999\n3000\n')).toBe(true);
    expect(full?.startsWith('1\n2\n')).toBe(true);
  });
});
