import { tool } from 'ai';
import { z } from 'zod/v4';
import {
  errorSchema,
  getSandbox,
  resolvePath,
  withTimeout,
  type FsTool,
  type FsToolSettings,
} from './fs-tool-settings';

export type DeleteFileInput = z.infer<typeof inputSchema>;

export type DeleteFileOutput = z.infer<typeof outputSchema>;

const inputSchema = z.object({
  path: z.string().min(1).describe('Path of the file to delete.'),
});

const outputSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('deleted'),
    path: z.string(),
  }),
  errorSchema(['not_found', 'is_directory', 'timeout']),
]);

export function createDeleteFileTool(
  settings: FsToolSettings,
): FsTool<DeleteFileInput, DeleteFileOutput> {
  return tool<DeleteFileInput, DeleteFileOutput, {}>({
    description:
      'Delete a file. Directories cannot be deleted. A symbolic link is ' +
      'deleted itself, not the file it points to.',
    inputSchema,
    outputSchema,
    execute: async ({ path }, { abortSignal, experimental_sandbox }) => {
      const sandbox = getSandbox(experimental_sandbox);
      const resolvedPath = resolvePath({ settings, path });

      return withTimeout<DeleteFileOutput>({
        settings,
        abortSignal,
        onTimeout: message => ({
          type: 'error',
          path,
          errorCode: 'timeout',
          message,
        }),
        operation: async signal => {
          let deleted: boolean;
          try {
            deleted = await sandbox.deleteFile({
              path: resolvedPath,
              abortSignal: signal,
            });
          } catch (deleteError) {
            const stat = await sandbox.stat({
              path: resolvedPath,
              abortSignal: signal,
            });
            if (stat?.type === 'directory') {
              return {
                type: 'error',
                path,
                errorCode: 'is_directory',
                message: `${path} is a directory. Only files can be deleted.`,
              };
            }
            throw deleteError;
          }

          if (!deleted) {
            return {
              type: 'error',
              path,
              errorCode: 'not_found',
              message: `${path} does not exist.`,
            };
          }

          return { type: 'deleted', path };
        },
      });
    },
    toModelOutput: ({ output }) => {
      switch (output.type) {
        case 'deleted':
          return { type: 'text', value: `Deleted ${output.path}.` };
        case 'error':
          return { type: 'error-text', value: output.message };
      }
    },
  });
}
