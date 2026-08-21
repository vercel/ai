import { spacexai } from '@ai-sdk/spacexai';
import { ToolLoopAgent, type InferAgentUIMessage } from 'ai';

export const xaiImageGenerationAgent = new ToolLoopAgent({
  model: spacexai.responses('grok-4.5'),
  tools: {
    image_generation: spacexai.tools.imageGeneration(),
  },
  onStepFinish: ({ request }) => {
    console.log(JSON.stringify(request.body, null, 2));
  },
});

export type SpaceXAIImageGenerationMessage = InferAgentUIMessage<
  typeof xaiImageGenerationAgent
>;
