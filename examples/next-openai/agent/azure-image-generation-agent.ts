import { createAzure, azure } from '@ai-sdk/azure';
import { InferAgentUIMessage, ToolLoopAgent } from 'ai';

export function createAzureImageGenerationAgent(modelId: string) {
  const model = createAzure({
    headers: {
      'x-ms-oai-image-generation-deployment': 'gpt-image-1', // use your own image model deployment
    },
  })(modelId);
  const azureImageGenerationAgent = new ToolLoopAgent({
    model,
    tools: {
      image_generation: azure.tools.imageGeneration({
        partialImages: 3,
        quality: 'low',
        size: '1024x1024',
      }),
    },
    onStepFinish: ({ request }) => {
      console.log(JSON.stringify(request.body, null, 2));
    },
  });
  return azureImageGenerationAgent;
}

export type AzureImageGenerationMessage = InferAgentUIMessage<
  ReturnType<typeof createAzureImageGenerationAgent>
>;
