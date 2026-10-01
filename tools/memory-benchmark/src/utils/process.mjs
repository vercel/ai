import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export function spawnCommand(command, options = {}) {
  const spawnOptions = {
    cwd: options.cwd,
    env: options.env,
    detached: options.detached ?? process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  };

  if (typeof command === 'string') {
    return spawn(command, {
      ...spawnOptions,
      shell: true,
    });
  }

  return spawn(command[0], command.slice(1), spawnOptions);
}

export function formatCommand(command) {
  return Array.isArray(command)
    ? command.map(part => JSON.stringify(part)).join(' ')
    : command;
}

export function attachOutput(child, logStream, options) {
  let outputTail = '';
  const readyPattern = options.readyPattern
    ? new RegExp(options.readyPattern)
    : undefined;
  let ready = readyPattern == null;
  let resolveReady;
  const readyPromise = new Promise(resolve => {
    resolveReady = resolve;
    if (ready) resolve();
  });

  const handleChunk = (source, chunk) => {
    const text = chunk.toString();
    logStream.write(`[${source}] ${text}`);
    if (options.verbose) {
      const destination = source === 'stderr' ? process.stderr : process.stdout;
      destination.write(text);
    }

    if (!ready && readyPattern) {
      outputTail = `${outputTail}${text}`.slice(-64 * 1024);
      if (readyPattern.test(outputTail)) {
        ready = true;
        resolveReady();
      }
    }
  };

  child.stdout.on('data', chunk => handleChunk('stdout', chunk));
  child.stderr.on('data', chunk => handleChunk('stderr', chunk));

  return { readyPromise, isReady: () => ready };
}

export function waitForExit(child) {
  return new Promise(resolve => {
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });
}

export function delay(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

export async function listProcesses() {
  if (process.platform === 'win32') {
    throw new Error(
      'Process-tree sampling currently supports macOS and Linux only',
    );
  }

  const { stdout } = await execFileAsync('ps', [
    '-axo',
    'pid=,ppid=,pgid=,rss=,vsz=,command=',
  ]);

  return stdout
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const match = line.match(
        /^(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/,
      );
      if (!match) return undefined;
      return {
        pid: Number(match[1]),
        ppid: Number(match[2]),
        pgid: Number(match[3]),
        rssBytes: Number(match[4]) * 1024,
        vszBytes: Number(match[5]) * 1024,
        command: match[6],
      };
    })
    .filter(Boolean);
}

export function getProcessTree(processes, rootPid) {
  const inTree = new Set([rootPid]);
  let changed = true;

  while (changed) {
    changed = false;
    for (const processInfo of processes) {
      if (!inTree.has(processInfo.pid) && inTree.has(processInfo.ppid)) {
        inTree.add(processInfo.pid);
        changed = true;
      }
    }
  }

  return processes.filter(
    processInfo =>
      processInfo.pgid === rootPid || inTree.has(processInfo.pid),
  );
}

export async function terminateProcessGroup(child, graceMs) {
  if (child.exitCode != null || child.signalCode != null) return;

  const sendSignal = signal => {
    try {
      if (process.platform === 'win32') {
        child.kill(signal);
      } else {
        process.kill(-child.pid, signal);
      }
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
  };

  sendSignal('SIGTERM');
  const deadline = Date.now() + graceMs;
  while (
    child.exitCode == null &&
    child.signalCode == null &&
    Date.now() < deadline
  ) {
    await delay(50);
  }
  if (child.exitCode == null && child.signalCode == null) sendSignal('SIGKILL');
}

export async function captureRepositoryState(cwd) {
  try {
    const [{ stdout: commit }, { stdout: status }] = await Promise.all([
      execFileAsync('git', ['-C', cwd, 'rev-parse', 'HEAD']),
      execFileAsync('git', ['-C', cwd, 'status', '--porcelain']),
    ]);
    return {
      commit: commit.trim(),
      dirty: status.trim().length > 0,
    };
  } catch {
    return undefined;
  }
}
