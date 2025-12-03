import {
  createProviderToolFactoryWithOutputSchema,
  lazySchema,
  zodSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

export const shellInputSchema = lazySchema(() =>
  zodSchema(
    z.object({
      action: z.object({
        commands: z.array(z.string()),
        timeoutMs: z.number().optional(),
        maxOutputLength: z.number().optional(),
      }),
    }),
  ),
);

export const shellOutputSchema = lazySchema(() =>
  zodSchema(
    z.object({
      output: z.array(
        z.object({
          stdout: z.string(),
          stderr: z.string(),
          outcome: z.discriminatedUnion('type', [
            z.object({ type: z.literal('timeout') }),
            z.object({ type: z.literal('exit'), exitCode: z.number() }),
          ]),
        }),
      ),
    }),
  ),
);

export const shell = createProviderToolFactoryWithOutputSchema<
  {
    /**
     * Shell tool action containing commands to execute.
     */
    action: {
      /**
       * A list of shell commands to execute.
       */
      commands: string[];

      /**
       * Optional timeout in milliseconds for the commands.
       */
      timeoutMs?: number;

      /**
       * Optional maximum number of characters to return from each command.
       */
      maxOutputLength?: number;
    };
  },
  {
    /**
     * An array of shell call output contents.
     */
    output: Array<{
      /**
       * Standard output from the command.
       */
      stdout: string;

      /**
       * Standard error from the command.
       */
      stderr: string;

      /**
       * The outcome of the shell execution - either timeout or exit with code.
       */
      outcome: { type: 'timeout' } | { type: 'exit'; exitCode: number };
    }>;
  },
  {}
>({
  id: 'openai.shell',
  inputSchema: shellInputSchema,
  outputSchema: shellOutputSchema,
});
