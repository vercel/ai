import { xai } from '@ai-sdk/xai';
import { ToolLoopAgent, type InferAgentUIMessage } from 'ai';

export const xaiImageGenerationAgent = new ToolLoopAgent({
  model: xai.responses('grok-4.5'),
  tools: {
    image_generation: xai.tools.imageGeneration(),
  },
  onStepFinish: ({ request }) => {
    console.log(JSON.stringify(request.body, null, 2));
  },
});

export type XaiImageGenerationMessage = InferAgentUIMessage<
  typeof xaiImageGenerationAgent
>;
