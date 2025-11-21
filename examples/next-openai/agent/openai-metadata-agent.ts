import { openai } from '@ai-sdk/openai';
import { ToolLoopAgent, InferAgentUIMessage } from 'ai';

import { z } from 'zod';

export const exampleMetadataSchema = z.object({
  createdAt: z.number().optional(),
  duration: z.number().optional(),
  model: z.string().optional(),
  totalTokens: z.number().optional(),
  finishReason: z.string().optional(),
});

export type ExampleMetadata = z.infer<typeof exampleMetadataSchema>;

export const openaiMetadataAgent = new ToolLoopAgent({
  model: openai('gpt-4o'),
  onStepFinish: ({ request }) => {
    console.dir(request.body, { depth: Infinity });
  },
});

export type OpenAIMetadataMessage = InferAgentUIMessage<
  typeof openaiMetadataAgent,
  ExampleMetadata
>;
