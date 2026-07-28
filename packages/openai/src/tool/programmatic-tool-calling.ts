import {
  createProviderExecutedToolFactory,
  lazySchema,
  zodSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

export const programmaticToolCallingInputSchema = lazySchema(() =>
  zodSchema(
    z.object({
      code: z.string(),
      fingerprint: z.string(),
    }),
  ),
);

export const programmaticToolCallingOutputSchema = lazySchema(() =>
  zodSchema(
    z.object({
      result: z.string(),
      status: z.enum(['completed', 'incomplete']),
    }),
  ),
);

const programmaticToolCallingFactory = createProviderExecutedToolFactory<
  {
    /**
     * JavaScript source generated and executed by OpenAI.
     */
    code: string;

    /**
     * Opaque replay fingerprint that must be preserved across requests.
     */
    fingerprint: string;
  },
  {
    /**
     * The result emitted by the hosted JavaScript program.
     */
    result: string;

    /**
     * Whether the program completed or stopped before producing a final result.
     */
    status: 'completed' | 'incomplete';
  },
  {}
>({
  id: 'openai.programmatic_tool_calling',
  inputSchema: programmaticToolCallingInputSchema,
  outputSchema: programmaticToolCallingOutputSchema,
  supportsDeferredResults: true,
});

export const programmaticToolCalling = () => programmaticToolCallingFactory({});
