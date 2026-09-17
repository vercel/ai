import {
  createProviderDefinedToolFactory,
  lazySchema,
  zodSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

export type OpenResponsesCustomToolOptions = {
  /**
   * An optional description of what the custom tool does.
   */
  description?: string;

  /**
   * The raw text format returned by the model.
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
};

const customInputSchema = lazySchema(() => zodSchema(z.string()));

export function createOpenResponsesTools({
  customToolId,
}: {
  customToolId: `${string}.${string}`;
}) {
  const customToolFactory = createProviderDefinedToolFactory<
    string,
    OpenResponsesCustomToolOptions
  >({
    id: customToolId,
    inputSchema: customInputSchema,
  });

  return {
    /**
     * Creates a caller-executed Open Responses custom tool. Custom tools return
     * a raw string, optionally constrained by a grammar.
     */
    customTool: (
      options: Parameters<typeof customToolFactory>[0],
    ): ReturnType<typeof customToolFactory> => customToolFactory(options),
  };
}
