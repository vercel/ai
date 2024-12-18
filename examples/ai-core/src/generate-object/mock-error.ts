import { generateObject, NoObjectGeneratedError } from 'ai';
import { MockLanguageModelV1 } from 'ai/test';
import 'dotenv/config';
import { z } from 'zod';

async function main() {
  try {
    await generateObject({
      model: new MockLanguageModelV1({
        defaultObjectGenerationMode: 'json',
        doGenerate: async () => ({
          rawCall: { rawPrompt: null, rawSettings: {} },
          response: {
            id: 'id-1',
            timestamp: new Date(123),
            modelId: 'model-1',
          },
          finishReason: 'stop',
          usage: { promptTokens: 10, completionTokens: 20 },
          text: `{"content":"Hello broken json`,
        }),
      }),
      schema: z.object({ content: z.string() }),
      prompt: 'Hello, test!',
    });
  } catch (error) {
    if (NoObjectGeneratedError.isInstance(error)) {
      console.log('NoObjectGeneratedError');
      console.log('Cause:', error.cause);
      console.log('Text:', error.text);
      console.log('Response:', error.response);
      console.log('Usage:', error.usage);
    }
  }
}

main().catch(console.error);
