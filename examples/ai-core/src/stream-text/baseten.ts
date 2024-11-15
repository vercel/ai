import { createOpenAI } from '@ai-sdk/openai';
import { streamText } from 'ai';
import 'dotenv/config';

const BASETEN_MODEL_ID = '<deployment-id>';
const BASETEN_DEPLOYMENT_ID = null;

// see https://docs.baseten.co/api-reference/openai for more information
const basetenExtraPayload = {
  model_id: BASETEN_MODEL_ID,
  deployment_id: BASETEN_DEPLOYMENT_ID,
};

const baseten = createOpenAI({
  name: 'baseten',
  apiKey: process.env.BASETEN_API_KEY ?? '',
  baseURL: 'https://bridge.baseten.co/v1/direct',
  fetch: async (url, request) => {
    if (!request || !request.body) {
      throw new Error('Request body is undefined');
    }
    const bodyWithBasetenPayload = JSON.stringify({
      ...JSON.parse(String(request.body)),
      baseten: basetenExtraPayload,
    });
    return await fetch(url, { ...request, body: bodyWithBasetenPayload });
  },
});

async function main() {
  const result = streamText({
    model: baseten('<model-name>'), // The name of the model you are serving in the baseten deployment
    prompt: 'Give me a poem about life',
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }

  console.log();
  console.log('Token usage:', await result.usage);
  console.log('Finish reason:', await result.finishReason);
}
main().catch(console.error);
