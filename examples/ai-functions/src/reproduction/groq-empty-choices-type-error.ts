import { createGroq } from '@ai-sdk/groq';
import { InvalidResponseDataError } from '@ai-sdk/provider';

const EMPTY_CHOICES_RESPONSE = {
  id: 'chatcmpl-empty',
  object: 'chat.completion',
  created: 0,
  model: 'openai/gpt-oss-20b',
  choices: [],
  usage: {
    prompt_tokens: 1,
    completion_tokens: 0,
    total_tokens: 1,
  },
};

async function main() {
  const model = createGroq({
    apiKey: 'test-api-key',
    fetch: async () =>
      new Response(JSON.stringify(EMPTY_CHOICES_RESPONSE), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
  })('openai/gpt-oss-20b');

  try {
    await model.doGenerate({
      prompt: [
        {
          role: 'user',
          content: [{ type: 'text', text: 'Hello' }],
        },
      ],
    });
  } catch (error) {
    if (InvalidResponseDataError.isInstance(error)) {
      return;
    }

    if (
      error instanceof TypeError &&
      error.message ===
        "Cannot read properties of undefined (reading 'message')"
    ) {
      console.error(
        'ISSUE #21183 REPRODUCED: Groq doGenerate threw a raw TypeError for an empty choices response.',
      );
      process.exitCode = 1;
      return;
    }

    throw error;
  }

  throw new Error(
    'Expected Groq doGenerate to reject an empty choices response with InvalidResponseDataError.',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
