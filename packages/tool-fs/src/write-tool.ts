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

export type WriteInput = z.infer<typeof inputSchema>;

export type WriteOutput = z.infer<typeof outputSchema>;

const inputSchema = z.object({
  path: z.string().min(1).describe('Path of the file to write.'),
  content: z.string().describe('The complete content of the file.'),
});

const outputSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('written'),
    path: z.string(),
    size: z.number(),
  }),
  errorSchema(['is_directory', 'timeout']),
]);

export function createWriteTool(
  settings: FsToolSettings,
): FsTool<WriteInput, WriteOutput> {
  return tool<WriteInput, WriteOutput, {}>({
    description:
      'Write a file, replacing it if it exists. Parent directories are ' +
      'created as needed. Prefer edit for changes to existing files.',
    inputSchema,
    outputSchema,
    execute: async (
      { path, content },
      { abortSignal, experimental_sandbox },
    ) => {
      const sandbox = getSandbox(experimental_sandbox);
      const resolvedPath = resolvePath({ settings, path });

      return withTimeout<WriteOutput>({
        settings,
        abortSignal,
        onTimeout: message => ({
          type: 'error',
          path,
          errorCode: 'timeout',
          message,
        }),
        operation: async signal => {
          try {
            await sandbox.writeTextFile({
              path: resolvedPath,
              content,
              abortSignal: signal,
            });
          } catch (writeError) {
            const stat = await sandbox.stat({
              path: resolvedPath,
              abortSignal: signal,
            });
            if (stat?.type === 'directory') {
              return {
                type: 'error',
                path,
                errorCode: 'is_directory',
                message: `${path} is a directory.`,
              };
            }
            throw writeError;
          }

          return {
            type: 'written',
            path,
            size: new TextEncoder().encode(content).byteLength,
          };
        },
      });
    },
    toModelOutput: ({ output }) => {
      switch (output.type) {
        case 'written':
          return {
            type: 'text',
            value: `Wrote ${output.size} bytes to ${output.path}.`,
          };
        case 'error':
          return { type: 'error-text', value: output.message };
      }
    },
  });
}
