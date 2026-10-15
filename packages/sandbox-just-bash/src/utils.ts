import { defineCommand, type CommandContext, type Sandbox } from 'just-bash';

const preparations = new WeakMap<Sandbox, Promise<void>>();

export async function ensureRealpath(sandbox: Sandbox): Promise<void> {
  let preparation = preparations.get(sandbox);
  if (preparation == null) {
    preparation = prepareRealpath(sandbox);
    preparations.set(sandbox, preparation);
  }

  try {
    await preparation;
  } catch (error) {
    if (preparations.get(sandbox) === preparation) {
      preparations.delete(sandbox);
    }
    throw error;
  }
}

async function prepareRealpath(sandbox: Sandbox): Promise<void> {
  const realpathType = await sandbox.bashEnvInstance.exec('type realpath');
  if (realpathType.exitCode === 0) {
    return;
  }

  sandbox.bashEnvInstance.registerCommand(
    defineCommand('realpath', executeRealpath),
  );
}

async function executeRealpath(
  args: string[],
  context: CommandContext,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  if (args.length === 0 || args[0] === '') {
    return {
      stdout: '',
      stderr: 'realpath: missing operand\n',
      exitCode: 1,
    };
  }

  let pending = args[0].startsWith('/') ? args[0] : `${context.cwd}/${args[0]}`;
  let resolved = '';
  let linkCount = 0;

  while (pending.length > 0) {
    pending = pending.replace(/^\//, '');
    if (pending.length === 0) {
      break;
    }

    const separatorIndex = pending.indexOf('/');
    const component =
      separatorIndex === -1 ? pending : pending.slice(0, separatorIndex);
    pending = separatorIndex === -1 ? '' : pending.slice(separatorIndex + 1);

    if (component === '' || component === '.') {
      continue;
    }
    if (component === '..') {
      resolved = resolved.slice(0, resolved.lastIndexOf('/'));
      continue;
    }

    const candidate = `${resolved}/${component}`;
    let isSymbolicLink = false;
    try {
      isSymbolicLink = (await context.fs.lstat(candidate)).isSymbolicLink;
    } catch (error) {
      if (!isFileNotFoundError(error)) {
        throw error;
      }
    }

    if (!isSymbolicLink) {
      resolved = candidate;
      continue;
    }

    linkCount += 1;
    if (linkCount > 64) {
      return { stdout: '', stderr: '', exitCode: 1 };
    }

    let target: string;
    try {
      target = await context.fs.readlink(candidate);
    } catch {
      return { stdout: '', stderr: '', exitCode: 1 };
    }

    const remainder = pending.length > 0 ? `/${pending}` : '';
    pending = target.startsWith('/')
      ? `${target}${remainder}`
      : `${candidate.slice(0, candidate.lastIndexOf('/'))}/${target}${remainder}`;
    resolved = '';
  }

  return {
    stdout: `${resolved || '/'}\n`,
    stderr: '',
    exitCode: 0,
  };
}

function isFileNotFoundError(error: unknown): boolean {
  if (error == null || typeof error !== 'object') return false;
  const code = (error as { code?: unknown }).code;
  if (code === 'ENOENT') return true;
  const message = (error as { message?: unknown }).message;
  return (
    typeof message === 'string' &&
    /no such file|not found|ENOENT/i.test(message)
  );
}
