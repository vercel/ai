import { tool } from 'ai';
import { z } from 'zod/v4';
import {
  errorSchema,
  getSandbox,
  MAX_LIST_ENTRIES,
  resolvePath,
  withTimeout,
  type FsTool,
  type FsToolSettings,
} from './fs-tool-settings';

export type ListInput = z.infer<typeof inputSchema>;

export type ListOutput = z.infer<typeof outputSchema>;

type ListErrorCode = Extract<ListOutput, { type: 'error' }>['errorCode'];

const inputSchema = z.object({
  path: z
    .string()
    .min(1)
    .optional()
    .describe(
      'Path of the directory to list. Defaults to the working directory.',
    ),
});

const outputSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('entries'),
    path: z.string(),
    entries: z.array(
      z.object({
        name: z.string(),
        type: z.enum(['file', 'directory', 'symlink', 'other']),
      }),
    ),
    totalEntries: z.number(),
  }),
  errorSchema(['not_found', 'not_a_directory', 'timeout']),
]);

function formatEntries(output: Extract<ListOutput, { type: 'entries' }>) {
  if (output.totalEntries === 0) {
    return `${output.path} is empty.`;
  }

  const lines = output.entries.map(entry => {
    switch (entry.type) {
      case 'directory':
        return `${entry.name}/`;
      case 'symlink':
        return `${entry.name} (symlink)`;
      default:
        return entry.name;
    }
  });

  if (output.entries.length < output.totalEntries) {
    lines.push(
      `\n[Showing ${output.entries.length} of ${output.totalEntries} entries. Use glob to find specific files.]`,
    );
  }

  return lines.join('\n');
}

export function createListTool(
  settings: FsToolSettings,
): FsTool<ListInput, ListOutput> {
  return tool<ListInput, ListOutput, {}>({
    description:
      'List the files and directories in a directory, without descending ' +
      'into subdirectories. Directories end with /. Use glob to find files ' +
      'recursively.',
    inputSchema,
    outputSchema,
    execute: async ({ path = '.' }, { abortSignal, experimental_sandbox }) => {
      const sandbox = getSandbox(experimental_sandbox);
      const resolvedPath = resolvePath({ settings, path });

      const error = (
        errorCode: ListErrorCode,
        message: string,
      ): ListOutput => ({
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
          let entries;
          try {
            entries = await sandbox.listDirectory({
              path: resolvedPath,
              abortSignal: signal,
            });
          } catch (listError) {
            const stat = await sandbox.stat({
              path: resolvedPath,
              abortSignal: signal,
            });
            if (stat !== null && stat.type !== 'directory') {
              return error(
                'not_a_directory',
                `${path} is not a directory. Use read to read files.`,
              );
            }
            throw listError;
          }

          if (entries === null) {
            return error('not_found', `${path} does not exist.`);
          }

          const sorted = [...entries].sort((a, b) =>
            a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
          );

          return {
            type: 'entries',
            path,
            entries: sorted.slice(0, MAX_LIST_ENTRIES),
            totalEntries: sorted.length,
          };
        },
      });
    },
    toModelOutput: ({ output }) => {
      switch (output.type) {
        case 'entries':
          return { type: 'text', value: formatEntries(output) };
        case 'error':
          return { type: 'error-text', value: output.message };
      }
    },
  });
}
