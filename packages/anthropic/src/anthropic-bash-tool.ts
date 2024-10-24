import { JSONValue } from '@ai-sdk/provider';
import { z } from 'zod';

const Bash20241022Parameters = z.object({
  command: z.string(),
  restart: z.boolean().nullish(),
});

export function anthropicBashTool(options: {
  execute?: (
    args: z.infer<typeof Bash20241022Parameters>,
    options: { abortSignal?: AbortSignal },
  ) => Promise<JSONValue>;
}): {
  type: 'provider-defined';
  id: 'anthropic.bash_20241022';
  args: {};
  parameters: typeof Bash20241022Parameters;
  execute?:
    | undefined
    | ((
        args: z.infer<typeof Bash20241022Parameters>,
        options: { abortSignal?: AbortSignal },
      ) => Promise<JSONValue>);
} {
  return {
    type: 'provider-defined',
    id: 'anthropic.bash_20241022',
    args: {},
    parameters: Bash20241022Parameters,
    execute: options.execute,
  };
}
