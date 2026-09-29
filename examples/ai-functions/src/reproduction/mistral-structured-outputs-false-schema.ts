import {
  createMistral,
  type MistralLanguageModelChatOptions,
} from '@ai-sdk/mistral';
import { generateText, NoObjectGeneratedError, Output } from 'ai';
import 'dotenv/config';
import { z } from 'zod';

const failureSignal =
  'ISSUE #21740 REPRODUCED: structuredOutputs=false omitted the schema and output failed schema validation.';

let requestBody: unknown;

const mistral = createMistral({
  fetch: async (input, init) => {
    const request = new Request(input, init);
    requestBody = await request.clone().json();
    return fetch(request);
  },
});

function requestIncludesSchema() {
  if (
    requestBody == null ||
    typeof requestBody !== 'object' ||
    !('messages' in requestBody) ||
    !Array.isArray(requestBody.messages)
  ) {
    return false;
  }

  return requestBody.messages.some(message => {
    if (
      message == null ||
      typeof message !== 'object' ||
      !('content' in message) ||
      typeof message.content !== 'string'
    ) {
      return false;
    }

    return (
      message.content.includes('JSON schema:') &&
      message.content.includes('"name"')
    );
  });
}

async function main() {
  try {
    const result = await generateText({
      model: mistral('mistral-small-latest'),
      output: Output.object({
        schema: z.object({ name: z.string() }),
      }),
      providerOptions: {
        mistral: {
          structuredOutputs: false,
        } satisfies MistralLanguageModelChatOptions,
      },
      prompt: 'Name a fruit.',
      temperature: 0,
    });

    if (!requestIncludesSchema()) {
      throw new Error(
        'The model happened to return a valid object, but the request still omitted the schema.',
      );
    }

    console.log(`Schema-preserving output: ${result.output.name}`);
  } catch (error) {
    if (
      NoObjectGeneratedError.isInstance(error) &&
      error.message === 'No object generated: response did not match schema.' &&
      !requestIncludesSchema()
    ) {
      console.error(failureSignal);
      console.error(`Mistral returned: ${error.text}`);
      process.exitCode = 1;
      return;
    }

    throw error;
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
