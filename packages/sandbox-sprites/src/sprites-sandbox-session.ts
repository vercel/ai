import {
  createTextOutputCapture,
  extractLines,
  type Experimental_SandboxDeleteFileOptions as DeleteFileOptions,
  type Experimental_SandboxDirectoryEntry as SandboxDirectoryEntry,
  type Experimental_SandboxFileStat as SandboxFileStat,
  type Experimental_SandboxListDirectoryOptions as ListDirectoryOptions,
  type Experimental_SandboxProcess as SandboxProcess,
  type Experimental_SandboxRunOptions as RunOptions,
  type Experimental_SandboxSession as SandboxSession,
  type Experimental_SandboxSpawnOptions as SpawnOptions,
  type Experimental_SandboxSpawnOptionsWithStdin as SpawnOptionsWithStdin,
  type Experimental_SandboxSpawnOptionsWithoutStdin as SpawnOptionsWithoutStdin,
  type Experimental_SandboxStatOptions as StatOptions,
  type Experimental_WritableSandboxProcess as WritableSandboxProcess,
} from '@ai-sdk/provider-utils';
import type { SpritesApiClient } from './sprites-api-client';

// Distinct from the exit codes bash and coreutils use for their own errors.
const NOT_FOUND_EXIT_CODE = 3;
const WRONG_TYPE_EXIT_CODE = 4;

// The path methods run these scripts because the Sprites `fs/list` and
// `fs/delete` endpoints do not document how they treat symbolic links, or
// whether `fs/delete` refuses a directory, and the session contract fixes both.

// `[ -e ]` is false both for missing paths and for paths that cannot be
// resolved (permissions, symbolic link loops), so open the path to get the
// reason. The error message ends with the reason; the path before it is
// user-supplied.
const EXIT_MISSING_FUNCTION = `
exit_missing() {
  error=$(LC_ALL=C; : 2>&1 < "$1")
  case $error in
    *": No such file or directory" | *": Not a directory") exit ${NOT_FOUND_EXIT_CODE} ;;
  esac
  echo "\${error:-Cannot access $1}" >&2
  exit 1
}
`;

// Paths are passed as `$1` so they aren't interpolated into the script.
const STAT_SCRIPT = `${EXIT_MISSING_FUNCTION}
[ -e "$1" ] || exit_missing "$1"
if [ -f "$1" ]; then type=file; elif [ -d "$1" ]; then type=directory; else type=other; fi
size=$(stat -L -c %s -- "$1") || exit 1
printf '%s %s' "$type" "$size"
`;

// `cd -P` so that `link/..` lists the same directory `[ -d ]` checked.
// `nullglob` would list an unreadable directory as empty, so check `-r` first.
const LIST_DIRECTORY_SCRIPT = `${EXIT_MISSING_FUNCTION}
if [ ! -d "$1" ]; then
  [ -e "$1" ] || exit_missing "$1"
  echo "Not a directory" >&2
  exit ${WRONG_TYPE_EXIT_CODE}
fi
cd -P -- "$1" || exit 1
[ -r . ] || { echo "Permission denied" >&2; exit 1; }
shopt -s dotglob nullglob
for name in *; do
  if [ -L "$name" ]; then type=symlink
  elif [ -f "$name" ]; then type=file
  elif [ -d "$name" ]; then type=directory
  else type=other
  fi
  printf '%s %s\\0' "$type" "$name"
done
`;

// A symbolic link is deleted itself, whether it points to a directory, to a
// file or to nothing.
const DELETE_FILE_SCRIPT = `${EXIT_MISSING_FUNCTION}
if [ -d "$1" ] && [ ! -L "$1" ]; then
  echo "Is a directory" >&2
  exit ${WRONG_TYPE_EXIT_CODE}
fi
[ -e "$1" ] || [ -L "$1" ] || exit_missing "$1"
rm -f -- "$1"
`;

/**
 * `Experimental_SandboxSession` implementation backed by a Sprite. This is the
 * tool-safe surface (file I/O, exec, spawn); it is what
 * {@link SpritesNetworkSandboxSession.restricted} and
 * `createSpritesSandboxSessionFromNativeSandbox` return and is not
 * constructed directly by consumers. It has no lifecycle of its own: only a
 * network sandbox session can delete the underlying Sprite.
 */
export class SpritesSandboxSession implements SandboxSession {
  constructor(
    protected readonly client: SpritesApiClient,
    protected readonly spriteName: string,
    protected readonly spritePublicUrl: string,
    protected readonly workingDirectory: string,
  ) {}

  get description(): string {
    return [
      `Sprite sandbox (name: ${this.spriteName}, url: ${this.spritePublicUrl}).`,
      `Default working directory: ${this.workingDirectory}.`,
      'Filesystem changes persist for the lifetime of the sprite.',
    ].join('\n');
  }

  /**
   * Resolve relative paths against the session working directory. The parts
   * are joined directly because normalizing `link/..` would not follow `link`.
   */
  protected resolvePath(path: string): string {
    if (path.startsWith('/')) return path;
    return this.workingDirectory === '/'
      ? `/${path}`
      : `${this.workingDirectory}/${path}`;
  }

  async run({
    command,
    workingDirectory,
    env,
    abortSignal,
    maxOutputLength,
  }: RunOptions): Promise<{
    exitCode: number;
    stdout: string;
    stderr: string;
    stdoutLength?: number;
    stderrLength?: number;
  }> {
    abortSignal?.throwIfAborted();
    // Validate the limit before the command starts.
    const captures =
      maxOutputLength === undefined
        ? undefined
        : {
            stdout: createTextOutputCapture({ maxLength: maxOutputLength }),
            stderr: createTextOutputCapture({ maxLength: maxOutputLength }),
          };

    const proc = await this.client.exec(this.spriteName, {
      argv: ['bash', '-c', command],
      cwd: this.resolvePath(workingDirectory ?? this.workingDirectory),
      ...(env !== undefined ? { env } : {}),
      ...(abortSignal !== undefined ? { abortSignal } : {}),
    });

    if (captures === undefined) return collectProcess(proc);

    // Keep only the prefixes while the rest of the output is drained.
    const [{ exitCode }] = await Promise.all([
      proc.wait(),
      readText(proc.stdout, chunk => captures.stdout.append(chunk)),
      readText(proc.stderr, chunk => captures.stderr.append(chunk)),
    ]);
    return {
      exitCode,
      stdout: captures.stdout.text,
      stderr: captures.stderr.text,
      stdoutLength: captures.stdout.length,
      stderrLength: captures.stderr.length,
    };
  }

  spawn(options: SpawnOptionsWithStdin): Promise<WritableSandboxProcess>;
  spawn(options: SpawnOptionsWithoutStdin): Promise<SandboxProcess>;
  spawn(
    options: SpawnOptions,
  ): Promise<SandboxProcess | WritableSandboxProcess>;
  async spawn({
    command,
    workingDirectory,
    env,
    abortSignal,
    stdin,
  }: SpawnOptions): Promise<SandboxProcess | WritableSandboxProcess> {
    abortSignal?.throwIfAborted();

    return await this.client.exec(this.spriteName, {
      argv: ['bash', '-c', command],
      cwd: this.resolvePath(workingDirectory ?? this.workingDirectory),
      ...(env !== undefined ? { env } : {}),
      ...(stdin === true ? { stdin } : {}),
      ...(abortSignal !== undefined ? { abortSignal } : {}),
    });
  }

  async readFile({
    path,
    abortSignal,
  }: {
    path: string;
    abortSignal?: AbortSignal;
  }): Promise<ReadableStream<Uint8Array> | null> {
    const bytes = await this.readBinaryFile({ path, abortSignal });
    if (bytes == null) return null;
    return bytesToStream(bytes);
  }

  async readBinaryFile({
    path,
    abortSignal,
  }: {
    path: string;
    abortSignal?: AbortSignal;
  }): Promise<Uint8Array | null> {
    abortSignal?.throwIfAborted();
    return this.client.readFile(
      this.spriteName,
      this.resolvePath(path),
      abortSignal,
    );
  }

  async readTextFile({
    path,
    encoding = 'utf-8',
    startLine,
    endLine,
    abortSignal,
  }: {
    path: string;
    encoding?: string;
    startLine?: number;
    endLine?: number;
    abortSignal?: AbortSignal;
  }): Promise<string | null> {
    const bytes = await this.readBinaryFile({ path, abortSignal });
    if (bytes == null) return null;
    const text = Buffer.from(bytes).toString(encoding as BufferEncoding);
    return extractLines({ text, startLine, endLine });
  }

  async writeFile({
    path,
    content,
    abortSignal,
  }: {
    path: string;
    content: ReadableStream<Uint8Array>;
    abortSignal?: AbortSignal;
  }): Promise<void> {
    const bytes = await collectBytes(content, abortSignal);
    await this.writeBinaryFile({ path, content: bytes, abortSignal });
  }

  async writeBinaryFile({
    path,
    content,
    abortSignal,
  }: {
    path: string;
    content: Uint8Array;
    abortSignal?: AbortSignal;
  }): Promise<void> {
    abortSignal?.throwIfAborted();
    // The filesystem write endpoint creates missing parent directories
    // recursively, satisfying the SandboxSession contract without an extra
    // round-trip.
    await this.client.writeFile(
      this.spriteName,
      this.resolvePath(path),
      content,
      abortSignal,
    );
  }

  async writeTextFile({
    path,
    content,
    encoding = 'utf-8',
    abortSignal,
  }: {
    path: string;
    content: string;
    encoding?: string;
    abortSignal?: AbortSignal;
  }): Promise<void> {
    const buffer = Buffer.from(content, encoding as BufferEncoding);
    await this.writeBinaryFile({
      path,
      content: new Uint8Array(
        buffer.buffer,
        buffer.byteOffset,
        buffer.byteLength,
      ),
      abortSignal,
    });
  }

  async stat({
    path,
    abortSignal,
  }: StatOptions): Promise<SandboxFileStat | null> {
    const result = await this.runPathScript({
      script: STAT_SCRIPT,
      path,
      abortSignal,
    });
    if (result.exitCode === NOT_FOUND_EXIT_CODE) return null;
    if (result.exitCode !== 0) {
      throw new Error(`Failed to stat ${path}: ${scriptError(result)}`);
    }
    const [type, size] = result.stdout.split(' ');
    return {
      type: type as SandboxFileStat['type'],
      size: Number(size),
    };
  }

  async listDirectory({
    path,
    abortSignal,
  }: ListDirectoryOptions): Promise<Array<SandboxDirectoryEntry> | null> {
    const result = await this.runPathScript({
      script: LIST_DIRECTORY_SCRIPT,
      path,
      abortSignal,
    });
    if (result.exitCode === NOT_FOUND_EXIT_CODE) return null;
    if (result.exitCode !== 0) {
      throw new Error(`Failed to list ${path}: ${scriptError(result)}`);
    }
    return result.stdout
      .split('\0')
      .filter(record => record !== '')
      .map(record => {
        const separator = record.indexOf(' ');
        return {
          name: record.slice(separator + 1),
          type: record.slice(0, separator) as SandboxDirectoryEntry['type'],
        };
      });
  }

  async deleteFile({ path, abortSignal }: DeleteFileOptions): Promise<boolean> {
    const result = await this.runPathScript({
      script: DELETE_FILE_SCRIPT,
      path,
      abortSignal,
    });
    if (result.exitCode === NOT_FOUND_EXIT_CODE) return false;
    if (result.exitCode === WRONG_TYPE_EXIT_CODE) {
      throw new Error(`Cannot delete ${path}: it is a directory.`);
    }
    if (result.exitCode !== 0) {
      throw new Error(`Failed to delete ${path}: ${scriptError(result)}`);
    }
    return true;
  }

  private async runPathScript({
    script,
    path,
    abortSignal,
  }: {
    script: string;
    path: string;
    abortSignal?: AbortSignal;
  }): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    abortSignal?.throwIfAborted();

    const proc = await this.client.exec(this.spriteName, {
      argv: ['bash', '-c', script, 'bash', this.resolvePath(path)],
      ...(abortSignal !== undefined ? { abortSignal } : {}),
    });

    return collectProcess(proc);
  }
}

async function collectProcess(
  proc: SandboxProcess,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const stdoutPromise = collectText(proc.stdout);
  const stderrPromise = collectText(proc.stderr);
  const { exitCode } = await proc.wait();
  const [stdout, stderr] = await Promise.all([stdoutPromise, stderrPromise]);

  return { exitCode, stdout, stderr };
}

/**
 * The message a path script printed. Sprites can replay the output of a
 * command that exits at once as stdout, so it may not be on stderr.
 */
function scriptError({
  stdout,
  stderr,
}: {
  stdout: string;
  stderr: string;
}): string {
  return (stderr || stdout).trim();
}

function bytesToStream(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

async function collectBytes(
  stream: ReadableStream<Uint8Array>,
  abortSignal?: AbortSignal,
): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  // A slow/never-ending source stream must not keep writeFile hung past an
  // abort: race each read against the signal, matching the abort error shape
  // `exec`'s `wait()` throws (see sprites-api-client.ts).
  let onAbort: (() => void) | undefined;
  const aborted =
    abortSignal != null
      ? new Promise<never>((_, reject) => {
          onAbort = () => {
            reject(
              abortSignal.reason ?? new DOMException('Aborted', 'AbortError'),
            );
          };
          abortSignal.addEventListener('abort', onAbort);
        })
      : undefined;
  try {
    abortSignal?.throwIfAborted();
    while (true) {
      const { value, done } = await (aborted
        ? Promise.race([reader.read(), aborted])
        : reader.read());
      if (done) break;
      if (value) {
        chunks.push(value);
        total += value.byteLength;
      }
    }
  } catch (error) {
    await reader.cancel(abortSignal?.reason).catch(() => {});
    reader.releaseLock();
    throw error;
  } finally {
    if (abortSignal != null && onAbort != null) {
      abortSignal.removeEventListener('abort', onAbort);
    }
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

async function collectText(
  stream: ReadableStream<Uint8Array>,
): Promise<string> {
  let text = '';
  await readText(stream, chunk => {
    text += chunk;
  });
  return text;
}

async function readText(
  stream: ReadableStream<Uint8Array>,
  onText: (chunk: string) => void,
): Promise<void> {
  const decoder = new TextDecoder();
  const reader = stream.getReader();
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) onText(decoder.decode(value, { stream: true }));
  }
  onText(decoder.decode());
}
