import {
  convertUint8ArrayToBase64,
  detectMediaType,
} from '@ai-sdk/provider-utils';
import { tool } from 'ai';
import { posix } from 'node:path';
import { z } from 'zod/v4';
import {
  errorSchema,
  getSandbox,
  MAX_READ_LINES,
  resolvePath,
  truncateLine,
  withTimeout,
  type FsTool,
  type FsToolSettings,
} from './fs-tool-settings';

export type ReadInput = z.infer<typeof inputSchema>;

export type ReadOutput = z.infer<typeof outputSchema>;

type ReadErrorCode = Extract<ReadOutput, { type: 'error' }>['errorCode'];

const inputSchema = z.object({
  path: z.string().min(1).describe('Path of the file to read.'),
  offset: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe(
      'Line number to start reading from, starting at 1. Use it to continue reading a truncated file.',
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe(
      `Maximum number of lines to read. Defaults to ${MAX_READ_LINES}.`,
    ),
});

const outputSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('text'),
    path: z.string(),
    content: z.string(),
    startLine: z.number(),
    endLine: z.number(),
    totalLines: z.number(),
    nextOffset: z.number().optional(),
  }),
  z.object({
    type: z.literal('file'),
    path: z.string(),
    mediaType: z.string(),
    size: z.number(),
    data: z.string(),
  }),
  z.object({
    type: z.literal('binary'),
    path: z.string(),
    size: z.number(),
  }),
  errorSchema([
    'not_found',
    'is_directory',
    'file_too_large',
    'invalid_offset',
    'timeout',
  ]),
]);

// Media types that models can view when returned as file parts.
function isViewableMediaType(mediaType: string): boolean {
  return (
    mediaType.startsWith('image/') ||
    mediaType.startsWith('audio/') ||
    mediaType.startsWith('video/') ||
    mediaType === 'application/pdf'
  );
}

// Bytes that are not valid UTF-8 or that contain NUL bytes are binary.
function decodeText(bytes: Uint8Array): string | undefined {
  if (bytes.subarray(0, 8192).includes(0)) {
    return undefined;
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return undefined;
  }
}

function splitLines(text: string): string[] {
  if (text === '') {
    return [];
  }
  const lines = text.split(/\r?\n/);
  if (lines[lines.length - 1] === '') {
    lines.pop();
  }
  return lines;
}

function formatText(output: Extract<ReadOutput, { type: 'text' }>): string {
  if (output.totalLines === 0) {
    return '[The file is empty.]';
  }

  const numbered = output.content
    .split('\n')
    .map((line, index) => `${output.startLine + index}\t${line}`)
    .join('\n');

  const footer =
    output.nextOffset !== undefined
      ? `\n\n[Showing lines ${output.startLine}-${output.endLine} of ${output.totalLines}. Call read with offset ${output.nextOffset} to continue.]`
      : '';

  return numbered + footer;
}

export function createReadTool(
  settings: FsToolSettings,
): FsTool<ReadInput, ReadOutput> {
  return tool<ReadInput, ReadOutput, {}>({
    description:
      'Read a file. Text files are returned with a line number and a tab ' +
      `before each line, up to ${MAX_READ_LINES} lines per call; use offset ` +
      'and limit to read other parts of long files. The line numbers are not ' +
      'part of the file content. Images, PDFs, audio, and video are returned ' +
      'as files. Use list to read directories.',
    inputSchema,
    outputSchema,
    execute: async (
      { path, offset = 1, limit = MAX_READ_LINES },
      { abortSignal, experimental_sandbox },
    ) => {
      const sandbox = getSandbox(experimental_sandbox);
      const resolvedPath = resolvePath({ settings, path });

      const error = (
        errorCode: ReadErrorCode,
        message: string,
      ): ReadOutput => ({
        type: 'error',
        path,
        errorCode,
        message,
      });

      return withTimeout({
        settings,
        abortSignal,
        onTimeout: message => error('timeout', message),
        operation: async signal => {
          const stat = await sandbox.stat({
            path: resolvedPath,
            abortSignal: signal,
          });
          if (stat === null) {
            return error('not_found', `${path} does not exist.`);
          }
          if (stat.type === 'directory') {
            return error(
              'is_directory',
              `${path} is a directory. Use list to see its contents.`,
            );
          }
          if (stat.size > settings.maxFileSize) {
            return error(
              'file_too_large',
              `${path} is ${stat.size} bytes, which exceeds the limit of ${settings.maxFileSize} bytes. Use grep to search it.`,
            );
          }

          const bytes = await sandbox.readBinaryFile({
            path: resolvedPath,
            abortSignal: signal,
          });
          if (bytes === null) {
            return error('not_found', `${path} does not exist.`);
          }

          const mediaType = detectMediaType({ data: bytes });
          if (mediaType !== undefined && isViewableMediaType(mediaType)) {
            return {
              type: 'file',
              path,
              mediaType,
              size: bytes.byteLength,
              data: convertUint8ArrayToBase64(bytes),
            };
          }

          const text = decodeText(bytes);
          if (text === undefined) {
            return { type: 'binary', path, size: bytes.byteLength };
          }

          const lines = splitLines(text);
          if (lines.length > 0 && offset > lines.length) {
            return error(
              'invalid_offset',
              `Offset ${offset} is past the end of ${path}, which has ${lines.length} lines.`,
            );
          }

          // Return whole lines until the line limit or the length limit is
          // reached. The first line is always returned.
          const selected: string[] = [];
          let length = 0;
          for (
            let index = offset - 1;
            index < lines.length && selected.length < limit;
            index++
          ) {
            const line = truncateLine(lines[index]);
            if (
              selected.length > 0 &&
              length + line.length > settings.maxReadLength
            ) {
              break;
            }
            selected.push(line);
            length += line.length + 1;
          }

          const endLine = offset + selected.length - 1;
          return {
            type: 'text',
            path,
            content: selected.join('\n'),
            startLine: lines.length === 0 ? 0 : offset,
            endLine: lines.length === 0 ? 0 : endLine,
            totalLines: lines.length,
            ...(endLine < lines.length ? { nextOffset: endLine + 1 } : {}),
          };
        },
      });
    },
    toModelOutput: ({ output }) => {
      switch (output.type) {
        case 'text':
          return { type: 'text', value: formatText(output) };
        case 'file':
          return {
            type: 'content',
            value: [
              {
                type: 'text',
                text: `${output.path} (${output.mediaType}, ${output.size} bytes)`,
              },
              {
                type: 'file',
                mediaType: output.mediaType,
                data: { type: 'data', data: output.data },
                filename: posix.basename(output.path),
              },
            ],
          };
        case 'binary':
          return {
            type: 'text',
            value: `${output.path} is a binary file (${output.size} bytes) and cannot be displayed.`,
          };
        case 'error':
          return { type: 'error-text', value: output.message };
      }
    },
  });
}
