import { createGoogleGenerativeAI } from '@ai-sdk/google';
import {
  generateImage,
  generateText,
  NoImageGeneratedError,
  streamText,
} from 'ai';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const fixtureDirectory = resolve(
  process.cwd(),
  '../../packages/google/src/__fixtures__',
);

type ScenarioResult = {
  finishReason?: string;
  promptFeedback?: unknown;
  error?: {
    name: string;
    message: string;
  };
};

type ImageScenarioResult = {
  error?: {
    name: string;
    message: string;
  };
  isNoImageGeneratedError: boolean;
};

function errorDetails(error: unknown) {
  return {
    name: error instanceof Error ? error.name : typeof error,
    message: error instanceof Error ? error.message : String(error),
  };
}

function isExpectedPromptBlock(result: ScenarioResult) {
  return (
    result.finishReason === 'content-filter' &&
    typeof result.promptFeedback === 'object' &&
    result.promptFeedback != null &&
    'blockReason' in result.promptFeedback &&
    result.promptFeedback.blockReason === 'PROHIBITED_CONTENT'
  );
}

async function main() {
  const [generateFixture, streamFixture, imageFixture] = await Promise.all([
    readFile(
      resolve(fixtureDirectory, 'issue-19758-prompt-block.json'),
      'utf8',
    ),
    readFile(
      resolve(fixtureDirectory, 'issue-19758-prompt-block.chunks.txt'),
      'utf8',
    ),
    readFile(
      resolve(fixtureDirectory, 'issue-19758-image-prompt-block.json'),
      'utf8',
    ),
  ]);

  const provider = createGoogleGenerativeAI({
    apiKey: 'test-api-key',
    fetch: async input => {
      const url = String(input);
      const isStream = url.includes(':streamGenerateContent');
      const isImage = url.includes('gemini-3.1-flash-image-preview');

      return new Response(
        isStream
          ? `data: ${streamFixture.trim()}\n\n`
          : isImage
            ? imageFixture
            : generateFixture,
        {
          status: 200,
          headers: {
            'content-type': isStream ? 'text/event-stream' : 'application/json',
          },
        },
      );
    },
  });

  let generateResult: ScenarioResult;
  try {
    const result = await generateText({
      model: provider('gemini-3.7-flash'),
      prompt: 'Prompt blocked by Google before candidate generation.',
    });
    generateResult = {
      finishReason: result.finishReason,
      promptFeedback: result.providerMetadata?.google.promptFeedback,
    };
  } catch (error) {
    generateResult = { error: errorDetails(error) };
  }

  let streamResult: ScenarioResult;
  try {
    const result = streamText({
      model: provider('gemini-3.7-flash'),
      prompt: 'Prompt blocked by Google before candidate generation.',
    });
    for await (const _ of result.fullStream) {
      // Consume the stream so the terminal result is available.
    }
    streamResult = {
      finishReason: await result.finishReason,
      promptFeedback: (await result.providerMetadata)?.google.promptFeedback,
    };
  } catch (error) {
    streamResult = { error: errorDetails(error) };
  }

  let imageResult: ImageScenarioResult;
  try {
    await generateImage({
      model: provider.image('gemini-3.1-flash-image-preview'),
      prompt: 'Prompt blocked by Google before candidate generation.',
    });
    imageResult = { isNoImageGeneratedError: false };
  } catch (error) {
    imageResult = {
      error: errorDetails(error),
      isNoImageGeneratedError: NoImageGeneratedError.isInstance(error),
    };
  }

  console.log(
    JSON.stringify({ generateResult, streamResult, imageResult }, null, 2),
  );

  if (
    !isExpectedPromptBlock(generateResult) ||
    !isExpectedPromptBlock(streamResult) ||
    !imageResult.isNoImageGeneratedError
  ) {
    throw new Error(
      'Issue #19758 reproduced: Google prompt-level safety block was not surfaced as content-filter with promptFeedback',
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
