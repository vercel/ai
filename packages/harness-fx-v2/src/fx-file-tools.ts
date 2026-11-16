import { shellQuote } from '@ai-sdk/harness/utils';
import { convertUint8ArrayToBase64 } from '@ai-sdk/provider-utils';
import type {
  FxEditFileInput,
  FxReadFileInput,
  FxWriteFileInput,
} from './fx-builtin-tool-specs';
import type { FxBuiltinToolOutput, FxToolSandbox } from './fx-builtin-tools';
import { createFxOutputCapture, readFxChunks } from './fx-sandbox-output';
import {
  decodeFxModelSafeText,
  getUtf8ByteLength,
  isFxToolOutput,
  readFxIntegerField,
  resolveFxPathField,
  toFxToolError,
  toFxToolFailure,
} from './fx-tool-paths';

const MiB = 1024 * 1024;

/*
 * fx's limits for its file tools: `default_max_read_file_lines` and
 * `default_max_read_file_line_len` in `tool_dispatch.zig`, the snapshot and
 * output caps in `read_file.zig`, `max_content_bytes` in `write_file.zig`,
 * and `max_encoded_image_bytes` in `image_data.zig`, all at
 * https://github.com/vercel-labs/fx/tree/v0.0.16/src
 */
const READ_LINES = 400;
const LINE_LENGTH = 2000;
const READ_SNAPSHOT_BYTES = 10 * MiB;
const READ_OUTPUT_BYTES = 256 * 1024;
const CONTENT_BYTES = 4 * MiB;
const MAX_ENCODED_IMAGE_BYTES = 5 * MiB;

/**
 * Returns the media type of an image from its leading bytes, for the image
 * formats fx's `read_file` attaches (PNG, JPEG, GIF and WebP).
 */
export function detectImageMediaType(options: {
  /**
   * Leading bytes of the file.
   */
  bytes: Uint8Array;
}): string | undefined {
  const { bytes } = options;
  const startsWith = (...signature: number[]) =>
    signature.every((byte, index) => bytes[index] === byte);
  if (startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) {
    return 'image/png';
  }
  if (startsWith(0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (startsWith(0x47, 0x49, 0x46, 0x38)) return 'image/gif';
  if (
    startsWith(0x52, 0x49, 0x46, 0x46) &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp';
  }
  return undefined;
}

/**
 * Returns fx's `read_file` result for an image: the image attached to the
 * result when its base64 encoding fits fx's 5 MiB attach limit, otherwise a
 * note with recovery guidance. fx's pixel size check is not performed; the
 * model provider rejects images it cannot take.
 */
function toImageResult(options: {
  /**
   * Path as fx shows it.
   */
  rel: string;

  /**
   * Media type of the image.
   */
  mediaType: string;

  /**
   * Bytes of the image.
   */
  bytes: Uint8Array;

  /**
   * Size of the image in bytes, which is larger than `bytes` when the file
   * was only read up to the snapshot limit.
   */
  size: number;
}): FxBuiltinToolOutput {
  const { rel, mediaType, bytes, size } = options;
  const encodedLength = Math.ceil(bytes.length / 3) * 4;
  if (size > READ_SNAPSHOT_BYTES || encodedLength > MAX_ENCODED_IMAGE_BYTES) {
    const reason =
      size > READ_SNAPSHOT_BYTES
        ? "the file exceeds read_file's 10 MiB read limit"
        : 'the image exceeds the 5 MiB encoded attach limit';
    return {
      text: `<path>${rel}</path>\n<content>image not attached: ${mediaType} (${size} bytes); ${reason}. Use an available image tool to save a smaller copy to a new file, then read_file the copy. If no image tool is available, ask the user before installing one.</content>`,
    };
  }
  return {
    text: `<path>${rel}</path>\n<content>image attached (${mediaType}, ${size} bytes)</content>`,
    images: [{ mediaType, data: convertUint8ArrayToBase64(bytes) }],
  };
}

/**
 * File contents `read_file` works on: at most the bytes of a snapshot, and
 * whether they are the whole file.
 */
type FxFileSnapshot = {
  /**
   * Bytes read.
   */
  bytes: Uint8Array;

  /**
   * Whether `bytes` is the whole file.
   */
  complete: boolean;

  /**
   * Size of the file in bytes, from its stat when only a snapshot was read.
   */
  totalBytes: number;
};

/**
 * Reads at most `limitBytes` from the start of a file with `head` in the
 * sandbox, so that the host never holds more of the file than that: a
 * session's read primitives load a whole file before they return, and the
 * workspace can hold a file of any size.
 */
async function readFileHead(options: {
  /**
   * Sandbox the file is in.
   */
  sandbox: FxToolSandbox;

  /**
   * Absolute path of the file.
   */
  path: string;

  /**
   * Maximum bytes to read.
   */
  limitBytes: number;

  /**
   * Aborts the read.
   */
  abortSignal: AbortSignal;
}): Promise<{
  /**
   * Bytes read, at most `limitBytes`.
   */
  bytes: Uint8Array;

  /**
   * Whether the file has more bytes than `limitBytes`.
   */
  exceeded: boolean;
}> {
  const { sandbox, path, limitBytes, abortSignal } = options;
  const { session, workDir } = sandbox;
  /*
   * One byte past the limit tells the caller whether the file goes on. The
   * command prints no more than that, encoded, and the capture drops
   * anything a sandbox sends beyond it, so neither can grow without bound.
   */
  const limit = limitBytes + 1;
  const encodedLimit = Math.ceil(limit / 3) * 4;
  const capture = createFxOutputCapture({
    // Base64 can wrap its lines, which are kept and dropped when decoding.
    headBytes: encodedLimit + Math.ceil(encodedLimit / 76) + 8,
    tailBytes: 0,
  });
  const limitController = new AbortController();
  let stopped = false;
  const onChunk = (chunk: Uint8Array) => {
    capture.add(chunk);
    if (!stopped && !capture.complete) {
      stopped = true;
      limitController.abort(new Error('read limit'));
    }
  };
  const readAbortSignal = AbortSignal.any([
    abortSignal,
    limitController.signal,
  ]);
  const child = await session.spawn({
    /*
     * A sandbox stream carries text, so the read is encoded: a plain `head`
     * would replace every byte that is not valid UTF-8.
     */
    command: `head -c ${limit} ${shellQuote(path)} | base64`,
    workingDirectory: workDir,
    abortSignal: readAbortSignal,
  });
  let exitCode: number | null = null;
  try {
    const [result] = await Promise.all([
      child.wait(),
      readFxChunks({
        stream: child.stdout,
        onChunk,
        abortSignal: readAbortSignal,
      }),
      readFxChunks({
        stream: child.stderr,
        onChunk: () => {},
        abortSignal: readAbortSignal,
      }),
    ]);
    exitCode = result.exitCode;
  } catch (error) {
    if (abortSignal.aborted) throw error;
    if (!stopped) throw error;
  }
  if (!stopped && exitCode != null && exitCode !== 0) {
    throw new Error(`read_file could not read ${path}`);
  }
  const decoded = Buffer.from(
    Buffer.from(capture.toBytes()).toString('utf8').replace(/\s+/g, ''),
    'base64',
  );
  return {
    bytes: decoded.subarray(0, limitBytes),
    exceeded: !capture.complete || decoded.length > limitBytes,
  };
}

/**
 * Reads the bytes of a snapshot of a file, so that the host holds at most a
 * snapshot of it: a file larger than a snapshot is read with `head` in the
 * sandbox instead of being loaded as a whole.
 */
async function readFileSnapshot(options: {
  /**
   * Sandbox the file is in.
   */
  sandbox: FxToolSandbox;

  /**
   * Absolute path of the file.
   */
  path: string;

  /**
   * Size of the file from its stat.
   */
  size: number;

  /**
   * Aborts the read.
   */
  abortSignal: AbortSignal;
}): Promise<FxFileSnapshot> {
  const { sandbox, path, size, abortSignal } = options;
  if (size <= READ_SNAPSHOT_BYTES) {
    const bytes =
      (await sandbox.session.readBinaryFile({ path, abortSignal })) ??
      new Uint8Array();
    /*
     * The read is bounded by the size its stat reported. A file that grew
     * past it before the read is cut here, after the read; reading small
     * files directly is the fast path, since a bounded read costs a command
     * in the sandbox.
     */
    return bytes.length <= READ_SNAPSHOT_BYTES
      ? { bytes, complete: true, totalBytes: bytes.length }
      : {
          bytes: bytes.subarray(0, READ_SNAPSHOT_BYTES),
          complete: false,
          totalBytes: bytes.length,
        };
  }
  const head = await readFileHead({
    sandbox,
    path,
    limitBytes: READ_SNAPSHOT_BYTES,
    abortSignal,
  });
  return {
    bytes: head.bytes,
    complete: !head.exceeded,
    totalBytes: head.exceeded
      ? Math.max(size, head.bytes.length + 1)
      : head.bytes.length,
  };
}

/**
 * Runs fx's `read_file` on the sandbox: up to 400 numbered lines from
 * `start_line` (each clipped at 2000 characters, all within 256 KiB of
 * output) wrapped in `<path>` and `<content>`, with a notice when lines were
 * left out. Images are attached, and other binary files are omitted. A file
 * larger than a snapshot is only read up to the snapshot limit.
 */
export async function readFxFile(options: {
  /**
   * Sandbox the tool runs on.
   */
  sandbox: FxToolSandbox;

  /**
   * Tool input given by the model.
   */
  input: FxReadFileInput;

  /**
   * Aborts the tool.
   */
  abortSignal: AbortSignal;
}): Promise<FxBuiltinToolOutput> {
  const { sandbox, input, abortSignal } = options;
  const { session, workDir, home } = sandbox;
  const target = resolveFxPathField({
    toolName: 'read_file',
    field: 'path',
    value: input.path,
    workDir,
    home,
  });
  if (isFxToolOutput(target)) return target;
  const start = readFxIntegerField({
    toolName: 'read_file',
    field: 'start_line',
    value: input.start_line,
    min: 1,
  });
  if (isFxToolOutput(start)) return start;
  const count = readFxIntegerField({
    toolName: 'read_file',
    field: 'line_count',
    value: input.line_count,
    min: 1,
  });
  if (isFxToolOutput(count)) return count;
  const startLine = start ?? 1;
  const lineCount = Math.min(count ?? READ_LINES, READ_LINES);

  const stat = await session.stat({ path: target.abs, abortSignal });
  if (stat == null) {
    return toFxToolFailure({
      toolName: 'read_file',
      message: 'read_file failed',
      details: { field: 'path', path: target.abs, error: 'FileNotFound' },
      suggestion:
        'Run glob_files to discover matching paths, or check the path relative to the workspace.',
    });
  }
  if (stat.type !== 'file') {
    return toFxToolFailure({
      toolName: 'read_file',
      message: 'read_file requires a regular file',
      details: { field: 'path', path: target.abs, error: 'NotRegularFile' },
      suggestion:
        'Use glob_files to inspect directory contents, then choose a regular file.',
    });
  }
  const snapshot = await readFileSnapshot({
    sandbox,
    path: target.abs,
    size: stat.size,
    abortSignal,
  });
  const { bytes, complete, totalBytes } = snapshot;
  const mediaType = detectImageMediaType({ bytes });
  if (mediaType != null) {
    return toImageResult({
      rel: target.rel,
      mediaType,
      bytes,
      size: totalBytes,
    });
  }
  const text = decodeFxModelSafeText({ bytes });
  if (text === undefined) {
    return {
      text: `<path>${target.rel}</path>\n<content>binary or non-utf8 file omitted (${totalBytes} bytes)</content>`,
    };
  }

  /*
   * Collects the lines fx keeps: from `start_line`, at most `lineCount`, each
   * clipped, as long as the rendered output (line numbers padded to the
   * widest one, a tab, the line and a newline) stays within the output cap.
   * The budget is recomputed when the number width grows.
   */
  const records: Array<{ number: number; text: string }> = [];
  let total = 0;
  let truncated = false;
  let stopped = false;
  let width = 1;
  let budget = 0;
  for (let at = 0, number = 1; at < text.length; number++) {
    const end = text.indexOf('\n', at);
    const line = text.slice(at, end === -1 ? text.length : end);
    total = number;
    if (!stopped && number >= startLine) {
      if (records.length >= lineCount) {
        truncated = true;
        stopped = true;
      } else {
        const digits = String(number).length;
        if (digits > width) {
          budget += records.length * (digits - width);
          width = digits;
        }
        const clipped =
          line.length > LINE_LENGTH
            ? `${line.slice(0, LINE_LENGTH)}... (line truncated)`
            : line;
        const rendered = budget + width + 1 + getUtf8ByteLength(clipped) + 1;
        if (rendered > READ_OUTPUT_BYTES) {
          truncated = true;
          stopped = true;
        } else {
          if (clipped !== line) truncated = true;
          records.push({ number, text: clipped });
          budget = rendered;
        }
      }
    }
    if (end === -1) break;
    at = end + 1;
  }

  let out = `<path>${target.rel}</path>\n<content>\n`;
  const last = records.at(-1);
  if (last != null) {
    const lastWidth = String(last.number).length;
    for (const record of records) {
      out += `${record.number}${' '.repeat(lastWidth - String(record.number).length)}\t${record.text}\n`;
    }
  } else if (total > 0 && startLine > total) {
    out += `... [start_line ${startLine} is beyond end of file; total lines ${total}]\n`;
  }
  const whole = !truncated && startLine === 1 && records.length === total;
  if ((!whole || !complete) && (records.length > 0 || truncated)) {
    out += complete
      ? `... [showing ${records.length} of ${total} lines; use start_line/line_count to read more.]\n`
      : `... [showing ${records.length} of at least ${total} lines; file snapshot was capped before EOF.]\n`;
  }
  return { text: `${out}</content>` };
}

/**
 * Runs fx's `write_file` on the sandbox: writes the complete contents,
 * creating parent directories, and reports `wrote <path> (<n> bytes)`, or
 * that nothing changed when the file already has the contents.
 */
export async function writeFxFile(options: {
  /**
   * Sandbox the tool runs on.
   */
  sandbox: FxToolSandbox;

  /**
   * Tool input given by the model.
   */
  input: FxWriteFileInput;

  /**
   * Aborts the tool.
   */
  abortSignal: AbortSignal;
}): Promise<FxBuiltinToolOutput> {
  const { sandbox, input, abortSignal } = options;
  const { session, workDir, home } = sandbox;
  const target = resolveFxPathField({
    toolName: 'write_file',
    field: 'path',
    value: input.path,
    workDir,
    home,
  });
  if (isFxToolOutput(target)) return target;
  if (typeof input.content !== 'string') {
    return toFxToolError({
      text: 'write_file field "content" must be a string',
    });
  }
  const { content } = input;
  const contentBytes = getUtf8ByteLength(content);
  if (contentBytes > CONTENT_BYTES) {
    return toFxToolError({
      text: 'write_file failed: content exceeds the 4 MiB preparation limit',
    });
  }
  const stat = await session.stat({ path: target.abs, abortSignal });
  if (stat != null && stat.type !== 'file') {
    return toFxToolError({
      text: 'file mutation preparation failed: target is not a regular file',
    });
  }
  /*
   * Only a file of the content's size can have the content, so any other
   * file is not read here, and the read of a matching file is bounded by
   * that size.
   */
  if (stat != null && stat.size === contentBytes) {
    const existing = await readFileHead({
      sandbox,
      path: target.abs,
      limitBytes: contentBytes,
      abortSignal,
    });
    if (
      !existing.exceeded &&
      decodeFxModelSafeText({ bytes: existing.bytes }) === content
    ) {
      return {
        text: `No changes to ${target.rel}; it already contains the requested content`,
      };
    }
  }
  await session.writeTextFile({ path: target.abs, content, abortSignal });
  return {
    text: `wrote ${target.rel} (${contentBytes} bytes)`,
  };
}

/**
 * Runs fx's `edit_file` on the sandbox: replaces the one exact occurrence of
 * `old_string` with `new_string` and reports `edited <path> (<n> bytes)`,
 * with fx's failures for missing, repeated or identical strings.
 */
export async function editFxFile(options: {
  /**
   * Sandbox the tool runs on.
   */
  sandbox: FxToolSandbox;

  /**
   * Tool input given by the model.
   */
  input: FxEditFileInput;

  /**
   * Aborts the tool.
   */
  abortSignal: AbortSignal;
}): Promise<FxBuiltinToolOutput> {
  const { sandbox, input, abortSignal } = options;
  const { session, workDir, home } = sandbox;
  const target = resolveFxPathField({
    toolName: 'edit_file',
    field: 'path',
    value: input.path,
    workDir,
    home,
  });
  if (isFxToolOutput(target)) return target;
  for (const field of ['old_string', 'new_string'] as const) {
    if (typeof input[field] !== 'string') {
      return toFxToolError({
        text: `edit_file field "${field}" must be a string`,
      });
    }
  }
  const { old_string: oldString, new_string: newString } = input;
  if (oldString === newString) {
    return toFxToolError({
      text: 'edit_file failed: old_string and new_string are identical',
    });
  }
  const stat = await session.stat({ path: target.abs, abortSignal });
  if (stat == null) {
    return toFxToolError({
      text: 'file mutation preparation failed: approved filesystem identity changed',
    });
  }
  if (stat.type !== 'file') {
    return toFxToolError({
      text: 'file mutation preparation failed: target is not a regular file',
    });
  }
  /*
   * The preimage limit is checked before the file is read, so a file of any
   * size is never loaded into host memory just to be rejected for its size.
   */
  if (stat.size > CONTENT_BYTES) {
    return toFxToolError({
      text: 'file mutation preparation failed: preimage exceeds the 4 MiB preparation limit',
    });
  }
  const preimage = await readFileHead({
    sandbox,
    path: target.abs,
    limitBytes: CONTENT_BYTES,
    abortSignal,
  });
  if (preimage.exceeded) {
    return toFxToolError({
      text: 'file mutation preparation failed: preimage exceeds the 4 MiB preparation limit',
    });
  }
  const before = decodeFxModelSafeText({ bytes: preimage.bytes });
  if (before === undefined) {
    return toFxToolError({
      text: 'file mutation preparation failed: unable to read the approved preimage',
    });
  }
  let occurrences = 0;
  if (oldString !== '') {
    for (
      let at = before.indexOf(oldString);
      at !== -1;
      at = before.indexOf(oldString, at + oldString.length)
    ) {
      occurrences++;
    }
  }
  if (occurrences === 0) {
    return toFxToolError({
      text: 'edit_file failed: old_string not found in file. Re-read the file to see its current contents; if the change is already applied, do not retry this edit.',
    });
  }
  if (occurrences > 1) {
    return toFxToolError({
      text: `edit_file failed: old_string is not unique (found ${occurrences} occurrences), provide more context`,
    });
  }
  const at = before.indexOf(oldString);
  const after =
    before.slice(0, at) + newString + before.slice(at + oldString.length);
  if (getUtf8ByteLength(after) > CONTENT_BYTES) {
    return toFxToolError({
      text: 'edit_file failed: postimage exceeds the 4 MiB preparation limit',
    });
  }
  await session.writeTextFile({
    path: target.abs,
    content: after,
    abortSignal,
  });
  return {
    text: `edited ${target.rel} (${getUtf8ByteLength(after)} bytes)`,
  };
}
