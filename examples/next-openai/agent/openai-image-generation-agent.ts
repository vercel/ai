import { openai } from '@ai-sdk/openai';
import { InferAgentUIMessage, ToolLoopAgent } from 'ai';

export const openaiImageGenerationAgent = new ToolLoopAgent({
  model: openai('gpt-5-nano'),
  tools: {
    image_generation: openai.tools.imageGeneration({
      partialImages: 3,
      quality: 'low',
      size: '1024x1024',
    }),
  },
  onStepFinish: ({ request }) => {
    console.log(JSON.stringify(request.body, null, 2));
  },
});

export type OpenAIImageGenerationMessage = InferAgentUIMessage<
  typeof openaiImageGenerationAgent
>;
