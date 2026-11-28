import type { Experimental_SandboxSession } from '@ai-sdk/provider-utils';
import { readBridgeMeta } from './bridge-ready';
import { sleep } from './sleep';

const POLL_INTERVAL_MS = 100;
const MAX_CMDLINE_OUTPUT_LENGTH = 64 * 1024;
const MAX_PROCESS_LIST_OUTPUT_LENGTH = 512 * 1024;
const MAX_PROCESS_COUNT = 10_000;
const KILL_BATCH_SIZE = 500;

/*
 * One line per process: pid, parent pid, state and start time. On Linux,
 * shell builtins read /proc, so procps is not needed; other systems use `ps`.
 */
const LIST_PROCESSES = [
  'if [ -r /proc/self/stat ]; then',
  `  for f in /proc/[0-9]*/stat; do`,
  '    set -f',
  `    read -r s < "$f" || continue`,
  `    case "$s" in *') '*) ;; *) continue ;; esac`,
  `    set -- \${s##*') '}`,
  `    [ -n "\${20}" ] || continue`,
  `    p=\${f#/proc/}`,
  `    echo "\${p%/stat} $2 $1 \${20}"`,
  '  done',
  'else',
  '  ps -A -o pid= -o ppid= -o stat= -o lstart=',
  'fi 2>/dev/null',
].join('\n');

/**
 * Stop the bridge process recorded in `bridge-meta.json` while it still runs,
 * so a replacement bridge can bind the port it holds. Call it before
 * `markBridgeStarting` overwrites the record.
 *
 * The bridge and the processes it started, such as the runtime running its
 * turn and that runtime's tool commands, get `SIGTERM`. Any that still run
 * after `gracePeriodMs` (5 seconds by default) get `SIGKILL`, and the call
 * waits up to `gracePeriodMs` again. A bridge that has exited no longer holds
 * its listening socket, so the port is free once it is gone. If a process
 * outlives both waits, the call returns anyway and the replacement reports
 * the port conflict.
 *
 * The recorded pid can be stale, for example after the sandbox was resumed
 * from a snapshot, so only a process whose command line contains
 * `bridgeStateDir` counts as the bridge. Without a recorded pid, or without
 * such a process, nothing is signalled.
 */
export async function stopPreviousBridge({
  sandbox,
  bridgeStateDir,
  bridgeType,
  gracePeriodMs = 5_000,
  abortSignal,
}: {
  sandbox: Experimental_SandboxSession;
  bridgeStateDir: string;
  bridgeType: string;
  gracePeriodMs?: number;
  abortSignal?: AbortSignal;
}): Promise<void> {
  const meta = await readBridgeMeta({
    sandbox,
    bridgeStateDir,
    bridgeType,
    abortSignal,
  });
  const pid = meta?.pid;
  // `kill` reads 0 and negative ids as process groups, so only accept a pid.
  if (pid === undefined || !Number.isSafeInteger(pid) || pid <= 0) return;

  const { stdout: commandLine } = await sandbox.run({
    // Linux exposes the command line in /proc; `ps` covers other systems.
    command: `{ tr '\\0' ' ' < /proc/${pid}/cmdline || ps -ww -o args= -p ${pid}; } 2>/dev/null`,
    maxOutputLength: MAX_CMDLINE_OUTPUT_LENGTH,
    abortSignal,
  });
  if (!commandLine.includes(bridgeStateDir)) return;

  const listProcesses = async () => {
    const { stdout, stdoutLength } = await sandbox.run({
      command: LIST_PROCESSES,
      maxOutputLength: MAX_PROCESS_LIST_OUTPUT_LENGTH,
      abortSignal,
    });
    const truncated =
      stdoutLength !== undefined && stdoutLength > stdout.length;
    return parseProcesses({ output: stdout, truncated });
  };
  const started = await listProcesses();
  // A pid counts as running only while it keeps the start time it has now,
  // so a pid that another process has reused is dropped, not signalled.
  const stillRunning = async (pids: number[]) => {
    const current = await listProcesses();
    return pids.filter(id => current.get(id)?.start === started.get(id)?.start);
  };

  // The bridge comes first, so it is signalled before its children exit.
  let remaining = processTree({ pid, processes: started });
  for (const signal of ['TERM', 'KILL']) {
    if (remaining.length === 0) return;
    for (let i = 0; i < remaining.length; i += KILL_BATCH_SIZE) {
      const batch = remaining.slice(i, i + KILL_BATCH_SIZE);
      await sandbox.run({
        command: `kill -${signal} ${batch.join(' ')}`,
        abortSignal,
      });
    }
    const deadline = Date.now() + gracePeriodMs;
    remaining = await stillRunning(remaining);
    while (remaining.length > 0 && Date.now() < deadline) {
      await sleep({ ms: POLL_INTERVAL_MS, abortSignal });
      abortSignal?.throwIfAborted();
      remaining = await stillRunning(remaining);
    }
  }
}

type ProcessEntry = { parent: number; start: string };

function parseProcesses({
  output,
  truncated = false,
}: {
  output: string;
  truncated?: boolean;
}): Map<number, ProcessEntry> {
  const processes = new Map<number, ProcessEntry>();
  const lines = output.split('\n');
  if (truncated && !output.endsWith('\n')) {
    lines.pop();
  }
  for (const line of lines) {
    if (processes.size >= MAX_PROCESS_COUNT) break;
    const [id, parent, state, ...start] = line.trim().split(/\s+/);
    const pid = Number(id);
    // A zombie has exited, so it holds no sockets and cannot be signalled.
    if (!Number.isSafeInteger(pid) || pid <= 0 || state?.startsWith('Z')) {
      continue;
    }
    processes.set(pid, { parent: Number(parent), start: start.join(' ') });
  }
  return processes;
}

/** The running `pid` and its descendants, parents before children. */
function processTree({
  pid,
  processes,
}: {
  pid: number;
  processes: Map<number, ProcessEntry>;
}): number[] {
  if (!processes.has(pid)) return [];

  const childrenByParent = new Map<number, number[]>();
  for (const [child, { parent }] of processes) {
    const siblings = childrenByParent.get(parent);
    if (siblings === undefined) {
      childrenByParent.set(parent, [child]);
    } else {
      siblings.push(child);
    }
  }

  const tree: number[] = [pid];
  const visited = new Set<number>([pid]);
  for (let i = 0; i < tree.length; i++) {
    const children = childrenByParent.get(tree[i]!);
    if (children === undefined) continue;
    for (const child of children) {
      if (!visited.has(child)) {
        visited.add(child);
        tree.push(child);
      }
    }
  }
  return tree;
}
