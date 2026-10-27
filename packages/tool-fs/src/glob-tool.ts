import { tool } from 'ai';
import { posix } from 'node:path';
import { z } from 'zod/v4';
import {
  errorSchema,
  getSandbox,
  PATH_NOT_FOUND_EXIT_CODE,
  shellQuotePath,
  stripDotSlash,
  withTimeout,
  type FsTool,
  type FsToolSettings,
} from './fs-tool-settings';
import { globToRegExp } from './glob-to-regexp';

export type GlobInput = z.infer<typeof inputSchema>;

export type GlobOutput = z.infer<typeof outputSchema>;

type GlobErrorCode = Extract<GlobOutput, { type: 'error' }>['errorCode'];

const inputSchema = z.object({
  pattern: z
    .string()
    .min(1)
    .describe(
      'Glob pattern to match, e.g. "**/*.ts" or "src/**/test-*.{js,ts}". Patterns without a slash match file names at any depth.',
    ),
  path: z
    .string()
    .min(1)
    .optional()
    .describe(
      'Directory to search in. Defaults to the working directory. The pattern is matched against paths relative to it.',
    ),
});

const outputSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('files'),
    path: z.string(),
    pattern: z.string(),
    files: z.array(z.string()),
    totalFiles: z.number(),
  }),
  errorSchema(['not_found', 'search_failed', 'timeout']),
]);

function formatFiles(output: Extract<GlobOutput, { type: 'files' }>): string {
  if (output.totalFiles === 0) {
    return `No files match ${output.pattern} in ${output.path}.`;
  }

  const footer =
    output.files.length < output.totalFiles
      ? `\n\n[Showing ${output.files.length} of ${output.totalFiles} files. Use a more specific pattern or path.]`
      : '';

  return output.files.join('\n') + footer;
}

export function createGlobTool(
  settings: FsToolSettings,
): FsTool<GlobInput, GlobOutput> {
  return tool<GlobInput, GlobOutput, {}>({
    description:
      'Find files by name with a glob pattern. Returns matching file paths ' +
      `sorted by path, up to ${settings.maxResults}. Files ignored by ` +
      '.gitignore are skipped when ripgrep is available in the sandbox; ' +
      'otherwise only .git and node_modules are skipped.',
    inputSchema,
    outputSchema,
    execute: async (
      { pattern, path = '.' },
      { abortSignal, experimental_sandbox },
    ) => {
      const sandbox = getSandbox(experimental_sandbox);
      const matcher = globToRegExp(pattern);
      const matchBaseName = !pattern.includes('/');

      const error = (
        errorCode: GlobErrorCode,
        message: string,
      ): GlobOutput => ({
        type: 'error',
        path,
        errorCode,
        message,
      });

      const command = [
        `target=${shellQuotePath(path)}`,
        `[ -e "$target" ] || exit ${PATH_NOT_FOUND_EXIT_CODE}`,
        'if command -v rg >/dev/null 2>&1; then',
        `  rg --files --hidden --glob '!.git' "$target"`,
        'else',
        `  find "$target" -type f -not -path '*/.git/*' -not -path '*/node_modules/*'`,
        'fi',
      ].join('\n');

      return withTimeout({
        settings,
        abortSignal,
        onTimeout: message => error('timeout', message),
        operation: async signal => {
          const result = await sandbox.run({
            command,
            ...(settings.workingDirectory !== undefined
              ? { workingDirectory: settings.workingDirectory }
              : {}),
            abortSignal: signal,
          });

          if (result.exitCode === PATH_NOT_FOUND_EXIT_CODE) {
            return error('not_found', `${path} does not exist.`);
          }
          if (result.exitCode > 1 && result.stdout === '') {
            return error(
              'search_failed',
              `Searching ${path} failed: ${result.stderr.trim()}`,
            );
          }

          const root = posix.normalize(path);
          const files = result.stdout
            .split('\n')
            .filter(line => line !== '')
            .map(stripDotSlash)
            .filter(file => {
              const relative =
                posix.relative(root, file) || posix.basename(file);
              return matcher.test(
                matchBaseName ? posix.basename(relative) : relative,
              );
            })
            .sort();

          return {
            type: 'files',
            path,
            pattern,
            files: files.slice(0, settings.maxResults),
            totalFiles: files.length,
          };
        },
      });
    },
    toModelOutput: ({ output }) => {
      switch (output.type) {
        case 'files':
          return { type: 'text', value: formatFiles(output) };
        case 'error':
          return { type: 'error-text', value: output.message };
      }
    },
  });
}
