import { createDeepSeek } from '@ai-sdk/deepseek';
import { InvalidResponseDataError } from '@ai-sdk/provider';

const EMPTY_CHOICES_RESPONSE = {
  id: 'chatcmpl-empty',
  object: 'chat.completion',
  created: 0,
  model: 'deepseek-chat',
  choices: [],
  usage: {
    prompt_tokens: 1,
    completion_tokens: 0,
    total_tokens: 1,
  },
};

async function main() {
  const provider = createDeepSeek({
    apiKey: 'test-api-key',
    fetch: async () =>
      new Response(JSON.stringify(EMPTY_CHOICES_RESPONSE), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
  });

  try {
    await provider.chat('deepseek-chat').doGenerate({
      prompt: [
        {
          role: 'user',
          content: [{ type: 'text', text: 'Hello' }],
        },
      ],
    });
  } catch (error) {
    if (
      error instanceof TypeError &&
      error.message.includes(
        "Cannot read properties of undefined (reading 'message')",
      )
    ) {
      throw new Error(
        'ISSUE #21138 REPRODUCED: DeepSeek doGenerate threw a raw TypeError for an empty choices response.',
        { cause: error },
      );
    }

    if (
      InvalidResponseDataError.isInstance(error) &&
      error.message === 'Response did not contain any choices.'
    ) {
      return;
    }

    throw error;
  }

  throw new Error(
    'Expected DeepSeek doGenerate to reject an empty choices response.',
  );
}

main();
