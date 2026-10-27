import { tool } from 'ai';
import { z } from 'zod/v4';
import {
  findMatches,
  getLineNumber,
  replaceRanges,
  type MatchMode,
} from './find-matches';
import {
  errorSchema,
  getSandbox,
  resolvePath,
  withTimeout,
  type FsTool,
  type FsToolSettings,
} from './fs-tool-settings';

export type EditInput = z.infer<typeof inputSchema>;

export type EditOutput = z.infer<typeof outputSchema>;

type EditErrorCode = Extract<EditOutput, { type: 'error' }>['errorCode'];

const inputSchema = z.object({
  path: z.string().min(1).describe('Path of the file to edit.'),
  oldString: z
    .string()
    .min(1)
    .describe(
      'The exact text to replace, including indentation. Do not include line numbers from read.',
    ),
  newString: z.string().describe('The text to replace it with.'),
  replaceAll: z
    .boolean()
    .optional()
    .describe(
      'Replace every occurrence of oldString. Defaults to false, which requires oldString to occur exactly once.',
    ),
});

const outputSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('edited'),
    path: z.string(),
    replacements: z.number(),
    startLine: z.number(),
    endLine: z.number(),
    matchMode: z.enum(['exact', 'trailing-whitespace', 'unicode-punctuation']),
  }),
  errorSchema([
    'not_found',
    'is_directory',
    'file_too_large',
    'binary_file',
    'no_changes',
    'no_match',
    'multiple_matches',
    'timeout',
  ]),
]);

const MATCH_MODE_NOTES: Record<MatchMode, string> = {
  exact: '',
  'trailing-whitespace':
    ' oldString matched after ignoring whitespace at line ends.',
  'unicode-punctuation':
    ' oldString matched after ignoring whitespace at line ends and treating typographic quotes, dashes, and spaces as ASCII.',
};

export function createEditTool(
  settings: FsToolSettings,
): FsTool<EditInput, EditOutput> {
  return tool<EditInput, EditOutput, {}>({
    description:
      'Edit a file by replacing oldString with newString. oldString must ' +
      'match the file exactly, including indentation, and occur once unless ' +
      'replaceAll is set. Read the file first so oldString is current. To ' +
      'create a file, use write.',
    inputSchema,
    outputSchema,
    execute: async (
      { path, oldString, newString, replaceAll = false },
      { abortSignal, experimental_sandbox },
    ) => {
      const sandbox = getSandbox(experimental_sandbox);
      const resolvedPath = resolvePath({ settings, path });

      const error = (
        errorCode: EditErrorCode,
        message: string,
      ): EditOutput => ({
        type: 'error',
        path,
        errorCode,
        message,
      });

      if (oldString === newString) {
        return error(
          'no_changes',
          'oldString and newString are identical, so there is nothing to change.',
        );
      }

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
            return error(
              'not_found',
              `${path} does not exist. Use write to create it.`,
            );
          }
          if (stat.type === 'directory') {
            return error('is_directory', `${path} is a directory.`);
          }
          if (stat.size > settings.maxFileSize) {
            return error(
              'file_too_large',
              `${path} is ${stat.size} bytes, which exceeds the limit of ${settings.maxFileSize} bytes.`,
            );
          }

          const bytes = await sandbox.readBinaryFile({
            path: resolvedPath,
            abortSignal: signal,
          });
          if (bytes === null) {
            return error(
              'not_found',
              `${path} does not exist. Use write to create it.`,
            );
          }

          let text: string;
          try {
            text = new TextDecoder('utf-8', {
              fatal: true,
              ignoreBOM: true,
            }).decode(bytes);
          } catch {
            return error(
              'binary_file',
              `${path} is not a UTF-8 text file and cannot be edited.`,
            );
          }

          // Keep the byte order mark and the line endings of the file.
          const bom = text.startsWith('﻿') ? '﻿' : '';
          const content = text.slice(bom.length);
          const toFileLineEndings = (value: string) =>
            content.includes('\r\n')
              ? value.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n')
              : value;
          const search = toFileLineEndings(oldString);
          const replacement = toFileLineEndings(newString);

          const match = findMatches({ content, search });
          if (match === undefined) {
            return error(
              'no_match',
              `oldString was not found in ${path}. Read the file again to get its current content. oldString must match exactly, including indentation, and must not include line numbers.`,
            );
          }

          if (match.ranges.length > 1 && !replaceAll) {
            const lines = match.ranges.map(range =>
              getLineNumber(content, range.start),
            );
            return error(
              'multiple_matches',
              `oldString occurs ${match.ranges.length} times in ${path}, at lines ${lines.join(', ')}. Include more surrounding lines to make it unique, or set replaceAll to replace every occurrence.`,
            );
          }

          const updated = replaceRanges({
            content,
            ranges: match.ranges,
            replacement,
          });
          await sandbox.writeTextFile({
            path: resolvedPath,
            content: bom + updated,
            abortSignal: signal,
          });

          // Lines of the replaced text in the updated file, from the first
          // replacement to the end of the last one.
          const startLine = getLineNumber(content, match.ranges[0].start);
          const lastRange = match.ranges[match.ranges.length - 1];
          const lastStart = match.ranges
            .slice(0, -1)
            .reduce(
              (start, range) =>
                start + replacement.length - (range.end - range.start),
              lastRange.start,
            );
          const endLine =
            getLineNumber(updated, lastStart) +
            replacement.replace(/\r?\n$/, '').split('\n').length -
            1;

          return {
            type: 'edited',
            path,
            replacements: match.ranges.length,
            startLine,
            endLine,
            matchMode: match.mode,
          };
        },
      });
    },
    toModelOutput: ({ output }) => {
      switch (output.type) {
        case 'edited': {
          const lines =
            output.startLine === output.endLine
              ? `line ${output.startLine}`
              : `lines ${output.startLine}-${output.endLine}`;
          const replacements =
            output.replacements === 1
              ? '1 replacement'
              : `${output.replacements} replacements`;
          return {
            type: 'text',
            value: `Edited ${output.path}: ${replacements}, ${lines}.${MATCH_MODE_NOTES[output.matchMode]}`,
          };
        }
        case 'error':
          return { type: 'error-text', value: output.message };
      }
    },
  });
}
