import { describe, expect, it } from 'vitest';
import { resolveClaudeExecutable } from './claude-code-harness';

type Session = Parameters<typeof resolveClaudeExecutable>[0]['session'];

function sandbox({
  marker = null,
  executables = [],
  onPath = null,
}: {
  marker?: string | null;
  executables?: string[];
  onPath?: string | null;
}): Session {
  return {
    readTextFile: async () => marker,
    run: async ({ command }: { command: string }) => {
      if (command.startsWith('test -x')) {
        const path = command.slice('test -x '.length).replace(/^'|'$/g, '');
        return {
          exitCode: executables.includes(path) ? 0 : 1,
          stdout: '',
          stderr: '',
        };
      }
      if (command === 'command -v claude') {
        return onPath
          ? { exitCode: 0, stdout: `${onPath}\n`, stderr: '' }
          : { exitCode: 1, stdout: '', stderr: '' };
      }
      throw new Error(`unexpected command: ${command}`);
    },
  } as unknown as Session;
}

const markerPath = '/wd/.harness-bootstrap/claude-code/.reused-executable';
const claude = '/opt/homebrew/bin/claude';

describe('resolveClaudeExecutable', () => {
  it('uses the recorded executable when it still works', async () => {
    expect(
      await resolveClaudeExecutable({
        reuse: true,
        session: sandbox({ marker: `${claude}\n`, executables: [claude] }),
        markerPath,
      }),
    ).toBe(claude);
  });

  it('lets the SDK use its own binary when no marker exists', async () => {
    expect(
      await resolveClaudeExecutable({
        reuse: true,
        session: sandbox({ marker: '' }),
        markerPath,
      }),
    ).toBeUndefined();
  });

  it('never overrides when reuse is disabled, even with a marker present', async () => {
    expect(
      await resolveClaudeExecutable({
        reuse: false,
        session: sandbox({ marker: claude, executables: [claude] }),
        markerPath,
      }),
    ).toBeUndefined();
  });

  // The bootstrap does not run again once its own marker exists, so a moved
  // executable has to be recovered here rather than at install time.
  it('rediscovers the executable when the recorded path has moved', async () => {
    expect(
      await resolveClaudeExecutable({
        reuse: true,
        session: sandbox({
          marker: '/old/path/claude',
          executables: ['/usr/local/bin/claude'],
          onPath: '/usr/local/bin/claude',
        }),
        markerPath,
      }),
    ).toBe('/usr/local/bin/claude');
  });

  // Falling back to the bundled binary is not an option: the bootstrap skipped
  // it, so say so instead of failing later inside the SDK.
  it('fails with a recoverable message when nothing usable remains', async () => {
    await expect(
      resolveClaudeExecutable({
        reuse: true,
        session: sandbox({ marker: '/gone/claude' }),
        markerPath,
      }),
    ).rejects.toThrow(/no longer usable.*systemExecutable: false/s);
  });

  it('falls back to the bundled binary when the marker cannot be read', async () => {
    const failing = {
      readTextFile: async () => {
        throw new Error('nope');
      },
    } as unknown as Session;
    expect(
      await resolveClaudeExecutable({
        reuse: true,
        session: failing,
        markerPath,
      }),
    ).toBeUndefined();
  });
});
