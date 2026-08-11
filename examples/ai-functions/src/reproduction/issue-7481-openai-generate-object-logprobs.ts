import {
  openai,
  type OpenAILanguageModelChatOptions,
  type OpenAILanguageModelResponsesOptions,
} from '@ai-sdk/openai';
import { generateObject, generateText } from 'ai';
import { z } from 'zod';

function getLogprobs(result: {
  providerMetadata?: Record<string, Record<string, unknown>>;
}) {
  const logprobs = result.providerMetadata?.openai?.logprobs;
  return Array.isArray(logprobs) ? logprobs : [];
}

async function main() {
  const responsesProviderOptions = {
    openai: {
      logprobs: 4,
    } satisfies OpenAILanguageModelResponsesOptions,
  };
  const responsesModel = openai('gpt-4.1-nano');

  const textResult = await generateText({
    model: responsesModel,
    providerOptions: responsesProviderOptions,
    prompt: 'What is the capital of France?',
  });
  const textLogprobs = getLogprobs(textResult);

  if (textLogprobs.length === 0) {
    throw new Error(
      'Comparison setup failed: generateText did not return OpenAI logprobs.',
    );
  }

  const objectResult = await generateObject({
    model: responsesModel,
    schema: z.object({
      name: z.string(),
    }),
    providerOptions: responsesProviderOptions,
    prompt:
      'What is the capital of France? Return its city name in the name field.',
  });
  const objectLogprobs = getLogprobs(objectResult);

  const chatObjectResult = await generateObject({
    model: openai.chat('gpt-4.1-nano'),
    schema: z.object({
      name: z.string(),
    }),
    providerOptions: {
      openai: {
        logprobs: 4,
      } satisfies OpenAILanguageModelChatOptions,
    },
    prompt:
      'What is the capital of France? Return its city name in the name field.',
  });
  const chatObjectLogprobs = getLogprobs(chatObjectResult);

  console.log(
    JSON.stringify({
      generateTextLogprobsCount: textLogprobs.length,
      generateObject: objectResult.object,
      generateObjectLogprobsCount: objectLogprobs.length,
      chatGenerateObject: chatObjectResult.object,
      chatGenerateObjectLogprobsCount: chatObjectLogprobs.length,
    }),
  );

  if (objectLogprobs.length === 0) {
    throw new Error(
      'ISSUE_7481_REPRODUCED: generateObject returned no OpenAI logprobs.',
    );
  }

  if (chatObjectLogprobs.length === 0) {
    throw new Error(
      'ISSUE_7481_REPRODUCED: generateObject returned no OpenAI Chat Completions logprobs.',
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
