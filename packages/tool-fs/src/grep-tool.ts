import { tool } from 'ai';
import { z } from 'zod/v4';
import {
  errorSchema,
  getSandbox,
  INVALID_PATTERN_EXIT_CODE,
  PATH_NOT_FOUND_EXIT_CODE,
  shellQuote,
  shellQuotePath,
  stripDotSlash,
  truncateLine,
  withTimeout,
  type FsTool,
  type FsToolSettings,
} from './fs-tool-settings';

export type GrepInput = z.infer<typeof inputSchema>;

export type GrepOutput = z.infer<typeof outputSchema>;

type GrepErrorCode = Extract<GrepOutput, { type: 'error' }>['errorCode'];

type OutputMode = NonNullable<GrepInput['outputMode']>;

const inputSchema = z.object({
  pattern: z
    .string()
    .min(1)
    .describe('Regular expression to search for, in ripgrep syntax.'),
  path: z
    .string()
    .min(1)
    .optional()
    .describe(
      'File or directory to search in. Defaults to the working directory.',
    ),
  glob: z
    .string()
    .min(1)
    .optional()
    .describe('Only search files whose names match this glob, e.g. "*.ts".'),
  ignoreCase: z
    .boolean()
    .optional()
    .describe('Match case-insensitively. Defaults to false.'),
  literal: z
    .boolean()
    .optional()
    .describe(
      'Treat the pattern as a literal string instead of a regular expression. Defaults to false.',
    ),
  context: z
    .number()
    .int()
    .min(0)
    .max(50)
    .optional()
    .describe(
      'Number of lines to show before and after each match. Only used with the content output mode.',
    ),
  outputMode: z
    .enum(['content', 'files', 'count'])
    .optional()
    .describe(
      'content returns matching lines as path:line:text, files returns the paths of matching files, and count returns the number of matches per file. Defaults to content.',
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe('Maximum number of output lines to return.'),
});

const outputSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('matches'),
    path: z.string(),
    pattern: z.string(),
    outputMode: z.enum(['content', 'files', 'count']),
    lines: z.array(z.string()),
    totalLines: z.number(),
  }),
  errorSchema(['not_found', 'invalid_pattern', 'search_failed', 'timeout']),
]);

function createCommand({
  pattern,
  path,
  glob,
  ignoreCase,
  literal,
  context,
  outputMode,
}: {
  pattern: string;
  path: string;
  glob: string | undefined;
  ignoreCase: boolean;
  literal: boolean;
  context: number | undefined;
  outputMode: OutputMode;
}): string {
  // Only flags supported by ripgrep, GNU grep, and the just-bash
  // implementations of both are used. `/dev/null` makes grep print file names
  // when the target is a single file.
  const rgArgs = [
    ...(outputMode === 'content' ? ['-n', '--with-filename'] : []),
    ...(outputMode === 'files' ? ['-l'] : []),
    ...(outputMode === 'count' ? ['-c', '--with-filename'] : []),
    ...(outputMode === 'content' && context !== undefined
      ? ['-C', String(context)]
      : []),
    // just-bash's ripgrep ignores case by default.
    ignoreCase ? '-i' : '-s',
    ...(literal ? ['-F'] : []),
    '--hidden',
    '--glob',
    shellQuote('!.git'),
    ...(glob !== undefined ? ['--glob', shellQuote(glob)] : []),
    '--sort',
    'path',
    '-e',
    shellQuote(pattern),
  ];

  const grepArgs = [
    '-r',
    ...(outputMode === 'content' ? ['-n'] : []),
    ...(outputMode === 'files' ? ['-l'] : []),
    ...(outputMode === 'count' ? ['-c'] : []),
    ...(outputMode === 'content' && context !== undefined
      ? ['-C', String(context)]
      : []),
    ...(ignoreCase ? ['-i'] : []),
    literal ? '-F' : '"$flavor"',
    ...(glob !== undefined ? [shellQuote(`--include=${glob}`)] : []),
    '--exclude-dir=.git',
    '--exclude-dir=node_modules',
    '-e',
    shellQuote(pattern),
  ];

  // Check the pattern against an empty input first, so an invalid pattern
  // can be told apart from other errors without parsing error messages.
  const validatePattern = (command: string) =>
    literal
      ? []
      : [
          `  error=$(${command} -e ${shellQuote(pattern)} /dev/null 2>&1 >/dev/null)`,
          `  if [ $? -eq 2 ]; then printf '%s\\n' "$error" >&2; exit ${INVALID_PATTERN_EXIT_CODE}; fi`,
        ];

  return [
    `target=${shellQuotePath(path)}`,
    `[ -e "$target" ] || exit ${PATH_NOT_FOUND_EXIT_CODE}`,
    'if command -v rg >/dev/null 2>&1; then',
    ...validatePattern('rg'),
    `  rg ${rgArgs.join(' ')} "$target"`,
    'else',
    // Prefer Perl-compatible regular expressions, which are closest to the
    // ripgrep syntax, when grep supports them.
    '  if grep -P x /dev/null >/dev/null 2>&1; [ $? -ne 2 ]; then flavor=-P; else flavor=-E; fi',
    ...validatePattern('grep "$flavor"'),
    `  grep ${grepArgs.join(' ')} "$target" /dev/null`,
    'fi',
  ].join('\n');
}

function formatMatches(output: Extract<GrepOutput, { type: 'matches' }>) {
  if (output.totalLines === 0) {
    return `No matches for ${output.pattern} in ${output.path}.`;
  }

  const footer =
    output.lines.length < output.totalLines
      ? `\n\n[Showing ${output.lines.length} of ${output.totalLines} lines. Narrow the search with path or glob, or increase limit.]`
      : '';

  return output.lines.join('\n') + footer;
}

export function createGrepTool(
  settings: FsToolSettings,
): FsTool<GrepInput, GrepOutput> {
  return tool<GrepInput, GrepOutput, {}>({
    description:
      'Search file contents with a regular expression. Uses ripgrep when ' +
      'the sandbox has it and grep otherwise. Files ignored by .gitignore ' +
      'are skipped when ripgrep is available; .git and node_modules are ' +
      `always skipped by grep. Returns up to ${settings.maxResults} lines ` +
      'unless limit is set.',
    inputSchema,
    outputSchema,
    execute: async (
      {
        pattern,
        path = '.',
        glob,
        ignoreCase = false,
        literal = false,
        context,
        outputMode = 'content',
        limit = settings.maxResults,
      },
      { abortSignal, experimental_sandbox },
    ) => {
      const sandbox = getSandbox(experimental_sandbox);

      const error = (
        errorCode: GrepErrorCode,
        message: string,
      ): GrepOutput => ({
        type: 'error',
        path,
        errorCode,
        message,
      });

      const command = createCommand({
        pattern,
        path,
        glob,
        ignoreCase,
        literal,
        context,
        outputMode,
      });

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

          if (result.exitCode === INVALID_PATTERN_EXIT_CODE) {
            return error(
              'invalid_pattern',
              `The pattern is not a valid regular expression: ${result.stderr.trim()}`,
            );
          }

          // ripgrep and grep exit with 1 when nothing matches and 2 on errors.
          // Errors for individual files still produce results for the rest.
          if (result.exitCode > 1 && result.stdout === '') {
            return error(
              'search_failed',
              `Searching ${path} failed: ${result.stderr.trim()}`,
            );
          }

          let lines = result.stdout
            .split('\n')
            .filter(line => line !== '')
            .map(stripDotSlash);

          if (outputMode === 'count') {
            lines = lines.filter(line => !line.endsWith(':0'));
          }
          if (outputMode !== 'content') {
            lines.sort();
          }

          return {
            type: 'matches',
            path,
            pattern,
            outputMode,
            lines: lines.slice(0, limit).map(truncateLine),
            totalLines: lines.length,
          };
        },
      });
    },
    toModelOutput: ({ output }) => {
      switch (output.type) {
        case 'matches':
          return { type: 'text', value: formatMatches(output) };
        case 'error':
          return { type: 'error-text', value: output.message };
      }
    },
  });
}
