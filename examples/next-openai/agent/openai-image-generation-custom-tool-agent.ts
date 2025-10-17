import { generateImageTool } from '@/tool/generate-image-tool';
import { openai } from '@ai-sdk/openai';
import { BasicAgent, InferAgentUIMessage } from 'ai';

export const openaiImageGenerationCustomToolAgent = new BasicAgent({
  model: openai('gpt-5-mini'),
  tools: {
    imageGeneration: generateImageTool,
  },
  onStepFinish: ({ request }) => {
    console.dir(request.body, { depth: Infinity });
  },
});

export type OpenAIImageGenerationCustomToolMessage = InferAgentUIMessage<
  typeof openaiImageGenerationCustomToolAgent
>;
