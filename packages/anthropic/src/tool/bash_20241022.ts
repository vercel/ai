import {
  createProviderDefinedToolFactory,
  lazySchema,
  type Sandbox,
  zodSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

const bash_20241022InputSchema = lazySchema(() =>
  zodSchema(
    z.object({
      command: z.string(),
      restart: z.boolean().optional(),
    }),
  ),
);

export const bash_20241022_internal = createProviderDefinedToolFactory<
  {
    /**
     * The bash command to run. Required unless the tool is being restarted.
     */
    command: string;

    /**
     * Specifying true will restart this tool. Otherwise, leave this unspecified.
     */
    restart?: boolean;
  },
  {}
>({
  id: 'anthropic.bash_20241022',
  inputSchema: bash_20241022InputSchema,
});

type Bash20241022Options<OUTPUT> = Parameters<
  typeof bash_20241022_internal<OUTPUT>
>[0];

type Bash20241022OptionsWithNullableExecute<OUTPUT> = Omit<
  Bash20241022Options<OUTPUT>,
  'execute'
> & {
  execute?: Bash20241022Options<OUTPUT>['execute'] | null;
};

type Bash20241022DefaultOutput = Awaited<ReturnType<Sandbox['executeCommand']>>;

export function bash_20241022(
  options?: Omit<Bash20241022Options<Bash20241022DefaultOutput>, 'execute'> & {
    execute?: undefined;
  },
): ReturnType<typeof bash_20241022_internal<Bash20241022DefaultOutput>>;
export function bash_20241022<OUTPUT = never>(
  options: Omit<Bash20241022Options<OUTPUT>, 'execute'> & {
    execute: null;
  },
): ReturnType<typeof bash_20241022_internal<OUTPUT>>;
export function bash_20241022<OUTPUT>(
  options: Omit<Bash20241022Options<OUTPUT>, 'execute'> & {
    execute: Bash20241022Options<OUTPUT>['execute'];
  },
): ReturnType<typeof bash_20241022_internal<OUTPUT>>;
export function bash_20241022<OUTPUT>(
  options: Bash20241022OptionsWithNullableExecute<OUTPUT> = {},
): ReturnType<typeof bash_20241022_internal<OUTPUT>> {
  const { execute, ...rest } = options;

  if (execute === undefined) {
    return bash_20241022_internal({
      ...rest,
      execute: async ({ command }, { sandbox }) => {
        if (!sandbox) {
          throw new Error('Sandbox is not available');
        }

        return await sandbox.executeCommand({ command });
      },
    } as Bash20241022Options<Bash20241022DefaultOutput>) as ReturnType<
      typeof bash_20241022_internal<OUTPUT>
    >;
  }

  return bash_20241022_internal({
    ...rest,
    ...(execute === null ? {} : { execute }),
  } as Bash20241022Options<OUTPUT>);
}
