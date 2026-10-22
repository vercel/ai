import {
  createProviderDefinedToolFactory,
  lazySchema,
  zodSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

export const customArgsSchema = lazySchema(() =>
  zodSchema(
    z.object({
      description: z.string().optional(),
      async: z.boolean().optional(),
      format: z
        .union([
          z.object({
            type: z.literal('grammar'),
            syntax: z.enum(['regex', 'lark']),
            definition: z.string(),
          }),
          z.object({
            type: z.literal('text'),
          }),
        ])
        .optional(),
    }),
  ),
);

const customInputSchema = lazySchema(() => zodSchema(z.string()));

export const customToolFactory = createProviderDefinedToolFactory<
  string,
  {
    /**
     * An optional description of what the tool does.
     */
    description?: string;

    /**
     * Whether the model can continue generating after calling this tool
     * without waiting for its result.
     */
    async?: boolean;

    /**
     * The output format specification for the tool.
     * Omit for unconstrained text output.
     */
    format?:
      | {
          type: 'grammar';
          syntax: 'regex' | 'lark';
          definition: string;
        }
      | {
          type: 'text';
        };
  }
>({
  id: 'openai.custom',
  inputSchema: customInputSchema,
});

export const customTool = (args: Parameters<typeof customToolFactory>[0]) =>
  customToolFactory(args);
