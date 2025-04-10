import { generateObject, NoObjectGeneratedError } from 'ai';
import { MockLanguageModelV2 } from 'ai/test';
import 'dotenv/config';
import { z } from 'zod';

async function main() {
  try {
    await generateObject({
      model: new MockLanguageModelV2({
        defaultObjectGenerationMode: 'json',
        doGenerate: async () => ({
          response: {
            id: 'id-1',
            timestamp: new Date(123),
            modelId: 'model-1',
          },
          finishReason: 'stop',
          usage: { inputTokens: 10, outputTokens: 20 },
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
