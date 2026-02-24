import { openai } from '@ai-sdk/openai';
import { ToolLoopAgent, InferAgentUIMessage } from 'ai';

export const openaiImageStoryboardAgent = new ToolLoopAgent({
  model: openai('gpt-5'),
  system: [
    'You are an AI storyboard assistant.',
    'The user describes scenes or ideas, and you respond with:',
    '- A short, vivid description of the scene in natural language.',
    '- When useful, you use the image_generation tool to create an illustration.',
    'Keep responses concise but visually rich and easy to scan.',
  ].join('\n'),
  tools: {
    image_generation: openai.tools.imageGeneration({
      partialImages: 3,
    }),
  },
});

export type OpenAIImageStoryboardMessage = InferAgentUIMessage<
  typeof openaiImageStoryboardAgent
>;
