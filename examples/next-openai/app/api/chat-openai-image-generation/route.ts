import { openai } from '@ai-sdk/openai';
import {
  Experimental_Agent as Agent,
  Experimental_InferAgentUIMessage as InferAgentUIMessage,
  validateUIMessages,
} from 'ai';

const imageGenerationAgent = new Agent({
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
  typeof imageGenerationAgent
>;

export async function POST(req: Request) {
  const { messages } = await req.json();

  return imageGenerationAgent.respond({
    messages: await validateUIMessages({ messages }),
  });
}
