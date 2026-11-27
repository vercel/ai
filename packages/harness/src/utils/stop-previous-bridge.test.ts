import { execFile, spawn } from 'node:child_process';
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execPath, kill } from 'node:process';
import { promisify } from 'node:util';
import type { Experimental_SandboxSession } from '@ai-sdk/provider-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { stopPreviousBridge } from './stop-previous-bridge';

const bridgeStateDir = '/home/user/.ai-sdk-harness/.agent-runs/s1/bridge';
const bridgeCommandLine = `node /home/user/.ai-sdk-harness/bootstrap/bridge.mjs --workdir /work --bridge-state-dir ${bridgeStateDir} `;
const recordedBridge = JSON.stringify({
  type: 'claude-code',
  port: 4000,
  state: 'running',
  pid: 42,
});
const bridgeProbe = expect.stringContaining('/proc/42/cmdline');
const processListing = expect.stringMatching(/^if \[ -r \/proc\/self\/stat \]/);

type FakeProcess = {
  parent: number;
  start: string;
  commandLine: string;
  state?: string;
};

/**
 * A sandbox whose process table holds the recorded bridge, pid 42, and the
 * `others` processes, keyed by pid. `onSignal` decides what a `kill` does to
 * the table; by default every signal ends the process. Its `run` ignores
 * abort signals, so aborts must be handled by the caller.
 */
function makeSandbox({
  meta,
  commandLine = bridgeCommandLine,
  others = {},
  onSignal = (pid, _signal, processes) => processes.delete(pid),
  processListOutput,
  processListStdoutLength,
}: {
  meta: string | null;
  commandLine?: string;
  others?: Record<number, { parent: number; state?: string }>;
  onSignal?: (
    pid: number,
    signal: string,
    processes: Map<number, FakeProcess>,
  ) => void;
  processListOutput?: () => string;
  processListStdoutLength?: () => number | undefined;
}) {
  const runs: string[] = [];
  const runOptions: Array<{ command: string; maxOutputLength?: number }> = [];
  const processes = new Map<number, FakeProcess>([
    [42, { parent: 1, start: '1042', commandLine }],
  ]);
  for (const [pid, { parent, state }] of Object.entries(others)) {
    processes.set(Number(pid), {
      parent,
      start: `1${pid}`,
      commandLine: '',
      state,
    });
  }
  const sandbox = {
    readTextFile: async ({ path: file }: { path: string }) =>
      file === `${bridgeStateDir}/bridge-meta.json` ? meta : null,
    run: async ({
      command,
      maxOutputLength,
    }: {
      command: string;
      maxOutputLength?: number;
    }) => {
      runs.push(command);
      runOptions.push({ command, maxOutputLength });
      let stdout = '';
      let stdoutLength: number | undefined;
      const kill = /^kill -(\w+) ([\d ]+)$/.exec(command);
      if (kill) {
        const [, signal, pids] = kill;
        for (const pid of pids.split(' ').map(Number)) {
          onSignal(pid, signal, processes);
        }
      } else if (command.includes('/proc/42/cmdline')) {
        stdout = processes.get(42)?.commandLine ?? '';
      } else if (processListOutput) {
        stdout = processListOutput();
        stdoutLength = processListStdoutLength?.();
      } else {
        for (const [pid, { parent, start, state = 'S' }] of processes) {
          stdout += `${pid} ${parent} ${state} ${start}\n`;
        }
      }
      return {
        exitCode: 0,
        stdout,
        stderr: '',
        ...(stdoutLength !== undefined ? { stdoutLength } : {}),
      };
    },
  } as unknown as Experimental_SandboxSession;
  return { sandbox, runs, runOptions };
}

describe('stopPreviousBridge', () => {
  it.each([
    ['no record', null],
    [
      'a record without a pid',
      JSON.stringify({ type: 'claude-code', state: 'starting' }),
    ],
    ['another bridge type', JSON.stringify({ type: 'codex', pid: 42 })],
    ['a process group id', JSON.stringify({ type: 'claude-code', pid: -1 })],
    ['an unreadable record', 'not json'],
  ])('signals nothing for %s', async (_, meta) => {
    const { sandbox, runs } = makeSandbox({ meta });

    await stopPreviousBridge({
      sandbox,
      bridgeStateDir,
      bridgeType: 'claude-code',
    });

    expect(runs).toEqual([]);
  });

  it.each([
    ['has exited', ''],
    ['runs another command', 'sleep 300 '],
  ])('signals nothing when the recorded process %s', async (_, commandLine) => {
    const { sandbox, runs } = makeSandbox({
      meta: recordedBridge,
      commandLine,
    });

    await stopPreviousBridge({
      sandbox,
      bridgeStateDir,
      bridgeType: 'claude-code',
    });

    expect(runs).toEqual([bridgeProbe]);
  });

  it('stops a running bridge with SIGTERM', async () => {
    const { sandbox, runs } = makeSandbox({ meta: recordedBridge });

    await stopPreviousBridge({
      sandbox,
      bridgeStateDir,
      bridgeType: 'claude-code',
    });

    expect(runs).toEqual([
      bridgeProbe,
      processListing,
      'kill -TERM 42',
      processListing,
    ]);
  });

  it('stops every process the bridge started, and nothing else', async () => {
    const { sandbox, runs } = makeSandbox({
      meta: recordedBridge,
      others: { 43: { parent: 42 }, 44: { parent: 43 }, 50: { parent: 1 } },
    });

    await stopPreviousBridge({
      sandbox,
      bridgeStateDir,
      bridgeType: 'claude-code',
    });

    expect(runs).toEqual([
      bridgeProbe,
      processListing,
      'kill -TERM 42 43 44',
      processListing,
    ]);
  });

  it('ignores processes that have already exited', async () => {
    const { sandbox, runs } = makeSandbox({
      meta: recordedBridge,
      others: { 43: { parent: 42, state: 'Z' } },
    });

    await stopPreviousBridge({
      sandbox,
      bridgeStateDir,
      bridgeType: 'claude-code',
    });

    expect(runs).toEqual([
      bridgeProbe,
      processListing,
      'kill -TERM 42',
      processListing,
    ]);
  });

  it('waits for the bridge to exit within the grace period', async () => {
    const { sandbox, runs } = makeSandbox({
      meta: recordedBridge,
      onSignal: (pid, _signal, processes) =>
        setTimeout(() => processes.delete(pid), 150),
    });

    await stopPreviousBridge({
      sandbox,
      bridgeStateDir,
      bridgeType: 'claude-code',
      gracePeriodMs: 5_000,
    });

    expect(runs).not.toContain('kill -KILL 42');
    expect(runs.slice(0, 3)).toEqual([
      bridgeProbe,
      processListing,
      'kill -TERM 42',
    ]);
    expect(runs.length).toBeGreaterThan(4);
  });

  it('kills the processes that outlive the grace period', async () => {
    const { sandbox, runs } = makeSandbox({
      meta: recordedBridge,
      others: { 43: { parent: 42 } },
      onSignal: (pid, signal, processes) => {
        if (pid === 42 || signal === 'KILL') processes.delete(pid);
      },
    });

    await stopPreviousBridge({
      sandbox,
      bridgeStateDir,
      bridgeType: 'claude-code',
      gracePeriodMs: 0,
    });

    expect(runs).toEqual([
      bridgeProbe,
      processListing,
      'kill -TERM 42 43',
      processListing,
      'kill -KILL 43',
      processListing,
    ]);
  });

  it('does not kill a pid that another process reused', async () => {
    const { sandbox, runs } = makeSandbox({
      meta: recordedBridge,
      others: { 43: { parent: 42 } },
      onSignal: (pid, signal, processes) => {
        if (signal === 'KILL') processes.delete(pid);
        if (pid === 43 && signal === 'TERM') {
          processes.set(43, { parent: 1, start: '9999', commandLine: '' });
        }
      },
    });

    await stopPreviousBridge({
      sandbox,
      bridgeStateDir,
      bridgeType: 'claude-code',
      gracePeriodMs: 0,
    });

    expect(runs).toContain('kill -KILL 42');
    expect(runs).not.toContain('kill -KILL 42 43');
  });

  it('returns when the bridge survives SIGKILL', async () => {
    const { sandbox, runs } = makeSandbox({
      meta: recordedBridge,
      onSignal: () => {},
    });

    await stopPreviousBridge({
      sandbox,
      bridgeStateDir,
      bridgeType: 'claude-code',
      gracePeriodMs: 0,
    });

    expect(runs.at(-2)).toBe('kill -KILL 42');
  });

  it('stops waiting when aborted', async () => {
    const controller = new AbortController();
    const reason = new Error('start aborted');
    const { sandbox, runs } = makeSandbox({
      meta: recordedBridge,
      onSignal: () => setTimeout(() => controller.abort(reason), 50),
    });

    await expect(
      stopPreviousBridge({
        sandbox,
        bridgeStateDir,
        bridgeType: 'claude-code',
        gracePeriodMs: 60_000,
        abortSignal: controller.signal,
      }),
    ).rejects.toBe(reason);
    expect(runs).toEqual([
      bridgeProbe,
      processListing,
      'kill -TERM 42',
      processListing,
    ]);
  });

  it('handles large process lists linearly and caps parsed entries', async () => {
    let killed = false;
    const rows = ['42 1 S 1042'];
    for (let i = 10_000; i < 50_000; i++) {
      rows.push(`${i} 42 S 1`);
    }
    const fullListing = `${rows.join('\n')}\n`;
    const { sandbox, runs } = makeSandbox({
      meta: recordedBridge,
      onSignal: () => {
        killed = true;
      },
      processListOutput: () => (killed ? '' : fullListing),
    });

    const start = Date.now();
    await stopPreviousBridge({
      sandbox,
      bridgeStateDir,
      bridgeType: 'claude-code',
    });
    const elapsedMs = Date.now() - start;

    expect(elapsedMs).toBeLessThan(2_000);
    const killRuns = runs.filter(run => run.startsWith('kill -TERM '));
    const signalledPids = killRuns.flatMap(run =>
      run.slice('kill -TERM '.length).split(' ').map(Number),
    );
    expect(signalledPids[0]).toBe(42);
    expect(signalledPids.length).toBe(10_000);
  });

  it('batches kill commands when the process tree exceeds 500 pids', async () => {
    const others: Record<number, { parent: number }> = {};
    for (let pid = 100; pid < 1_300; pid++) {
      others[pid] = { parent: 42 };
    }
    const { sandbox, runs } = makeSandbox({
      meta: recordedBridge,
      others,
    });

    await stopPreviousBridge({
      sandbox,
      bridgeStateDir,
      bridgeType: 'claude-code',
    });

    const killRuns = runs.filter(run => run.startsWith('kill -TERM '));
    expect(killRuns.length).toBe(3);
    const batchSizes = killRuns.map(
      run => run.slice('kill -TERM '.length).split(' ').length,
    );
    expect(batchSizes).toEqual([500, 500, 201]);
    expect(killRuns[0]!.startsWith('kill -TERM 42 ')).toBe(true);
  });

  it('handles parent-child cycles without looping', async () => {
    const cyclicListing = '42 44 S 1042\n43 42 S 1043\n44 43 S 1044\n';
    let killed = false;
    const { sandbox, runs } = makeSandbox({
      meta: recordedBridge,
      onSignal: () => {
        killed = true;
      },
      processListOutput: () => (killed ? '' : cyclicListing),
    });

    await stopPreviousBridge({
      sandbox,
      bridgeStateDir,
      bridgeType: 'claude-code',
    });

    expect(runs).toEqual([
      bridgeProbe,
      processListing,
      'kill -TERM 42 43 44',
      processListing,
    ]);
  });

  it('passes maxOutputLength and ignores a truncated trailing line', async () => {
    let killed = false;
    const truncatedListing = '42 1 S 1042\n43 42 S 1043\n44 42 S 10';
    const { sandbox, runs, runOptions } = makeSandbox({
      meta: recordedBridge,
      onSignal: () => {
        killed = true;
      },
      processListOutput: () => (killed ? '' : truncatedListing),
      processListStdoutLength: () =>
        killed ? 0 : truncatedListing.length + 100,
    });

    await stopPreviousBridge({
      sandbox,
      bridgeStateDir,
      bridgeType: 'claude-code',
    });

    expect(runOptions[0]?.maxOutputLength).toBeGreaterThan(0);
    expect(runOptions[1]?.maxOutputLength).toBeGreaterThan(0);
    expect(runs).toEqual([
      bridgeProbe,
      processListing,
      'kill -TERM 42 43',
      processListing,
    ]);
  });

  it('does not glob-expand filenames when reading crafted /proc stat lines', async () => {
    const { sandbox, runs } = makeSandbox({ meta: recordedBridge });
    await stopPreviousBridge({
      sandbox,
      bridgeStateDir,
      bridgeType: 'claude-code',
    });
    const listingCommand = runs[1]!;

    const workDir = await mkdtemp(path.join(tmpdir(), 'proc-glob-test-'));
    try {
      const fakeProc = path.join(workDir, 'proc');
      await mkdir(path.join(fakeProc, '42'), { recursive: true });
      await mkdir(path.join(fakeProc, '99'), { recursive: true });
      await mkdir(path.join(fakeProc, '100'), { recursive: true });
      await mkdir(path.join(fakeProc, 'self'), { recursive: true });
      await writeFile(path.join(fakeProc, 'self', 'stat'), '1 (sh) S 0\n');
      await writeFile(
        path.join(fakeProc, '42', 'stat'),
        '42 (node) S 1 1 1 0 -1 0 0 0 0 0 0 0 0 0 20 0 1 0 1042 0\n',
      );
      await writeFile(
        path.join(fakeProc, '99', 'stat'),
        '99 (a0000*\n) S 1 1 1 0 -1 0 0 0 0 0 0 0 0 0 20 0 1 0 1099 0\n',
      );
      await writeFile(
        path.join(fakeProc, '100', 'stat'),
        '100 (a) S 42\n) S 1 1 1 0 -1 0 0 0 0 0 0 0 0 0 20 0 1 0 1100 0\n',
      );
      await writeFile(
        path.join(workDir, '(a0000\n10000 42 S 1\n10001 42 S 1'),
        '',
      );

      const script = listingCommand.replaceAll('/proc', fakeProc);
      const { stdout } = await execFileAsync('bash', ['-c', script], {
        cwd: workDir,
        encoding: 'utf8',
      });

      expect(stdout.trim()).toBe('42 1 S 1042');
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  });
});

const execFileAsync = promisify(execFile);

/** Runs commands in a local shell, as a sandbox runs them. */
const localSandbox = {
  run: async ({ command }: { command: string }) => {
    try {
      const result = await execFileAsync('bash', ['-c', command], {
        encoding: 'utf8',
        maxBuffer: 16 * 1024 * 1024,
      });
      return { exitCode: 0, stdout: result.stdout, stderr: result.stderr };
    } catch (error) {
      const result = error as {
        code?: number;
        stdout?: string;
        stderr?: string;
      };
      return {
        exitCode: typeof result.code === 'number' ? result.code : 1,
        stdout: result.stdout ?? '',
        stderr: result.stderr ?? '',
      };
    }
  },
  readTextFile: async ({ path: file }: { path: string }) =>
    readFile(file, 'utf8').catch(() => null),
} as unknown as Experimental_SandboxSession;

describe('stopPreviousBridge with real processes', () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    await Promise.all(cleanups.splice(0).map(cleanup => cleanup()));
  });

  /**
   * Starts `script` as a stand-in bridge whose arguments name its state
   * directory, records its pid there, and resolves with the first line it
   * prints.
   */
  async function startRecordedProcess({
    script,
    namesStateDir = true,
  }: {
    script: string;
    namesStateDir?: boolean;
  }) {
    const stateDir = await mkdtemp(path.join(tmpdir(), 'bridge-state-'));
    const child = spawn(
      execPath,
      [
        '-e',
        script,
        '--',
        ...(namesStateDir ? ['--bridge-state-dir', stateDir] : []),
      ],
      { stdio: ['ignore', 'pipe', 'ignore'] },
    );
    const exitSignal = new Promise<string | null>(resolve =>
      child.once('exit', (_code, signal) => resolve(signal)),
    );
    cleanups.push(async () => {
      child.kill('SIGKILL');
      await rm(stateDir, { recursive: true, force: true });
    });
    const firstLine = await new Promise<string>(resolve =>
      child.stdout.once('data', chunk => resolve(String(chunk).trim())),
    );
    await writeFile(
      path.join(stateDir, 'bridge-meta.json'),
      JSON.stringify({ type: 'claude-code', pid: child.pid }),
    );
    return { child, exitSignal, stateDir, firstLine };
  }

  it('stops the bridge and every process it started', async () => {
    // Each process writes a file on SIGTERM and exits without stopping its
    // own child, so every one of them has to be signalled directly.
    const onTerm = `process.on('SIGTERM', () => { require('node:fs').writeFileSync(process.argv[1], ''); process.exit(0); });`;
    const tool = `${onTerm} console.log(process.pid); setInterval(() => {}, 1000);`;
    const runtime = `${onTerm} const tool = require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(tool)}, '--', process.argv[2]], { stdio: ['ignore', 'pipe', 'ignore'] }); tool.stdout.once('data', pid => console.log(process.pid + ' ' + String(pid).trim())); setInterval(() => {}, 1000);`;
    const bridge = await startRecordedProcess({
      script: `
        const dir = process.argv[process.argv.indexOf('--bridge-state-dir') + 1];
        const runtime = require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(runtime)}, '--', dir + '/runtime-stopped', dir + '/tool-stopped'], { stdio: ['ignore', 'pipe', 'ignore'] });
        runtime.stdout.once('data', pids => console.log(String(pids).trim()));
        setInterval(() => {}, 1000);
      `,
    });
    cleanups.push(async () => {
      for (const pid of bridge.firstLine.split(' ').map(Number)) {
        try {
          kill(pid, 'SIGKILL');
        } catch {}
      }
    });

    await stopPreviousBridge({
      sandbox: localSandbox,
      bridgeStateDir: bridge.stateDir,
      bridgeType: 'claude-code',
    });

    expect(await bridge.exitSignal).toBe('SIGTERM');
    for (const marker of ['runtime-stopped', 'tool-stopped']) {
      await expect(
        stat(path.join(bridge.stateDir, marker)),
      ).resolves.toBeDefined();
    }
  });

  it('kills a bridge that ignores SIGTERM', async () => {
    const bridge = await startRecordedProcess({
      script: `process.on('SIGTERM', () => {}); console.log('ready'); setInterval(() => {}, 1000);`,
    });

    await stopPreviousBridge({
      sandbox: localSandbox,
      bridgeStateDir: bridge.stateDir,
      bridgeType: 'claude-code',
      gracePeriodMs: 300,
    });

    expect(await bridge.exitSignal).toBe('SIGKILL');
  });

  it('leaves a recorded process alone when it does not run the bridge', async () => {
    const other = await startRecordedProcess({
      script: `console.log('ready'); setInterval(() => {}, 1000);`,
      namesStateDir: false,
    });

    await stopPreviousBridge({
      sandbox: localSandbox,
      bridgeStateDir: other.stateDir,
      bridgeType: 'claude-code',
    });

    expect(other.child.exitCode).toBeNull();
    expect(other.child.signalCode).toBeNull();
  });
});
