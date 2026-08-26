import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateText, streamText } from 'ai';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

type ScenarioResult = {
  finishReason?: string;
  promptFeedback?: unknown;
  error?: {
    name: string;
    message: string;
  };
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
  const fixtureDirectory = resolve(
    process.cwd(),
    '../../packages/google/src/__fixtures__',
  );
  const [generateFixture, streamFixture] = await Promise.all([
    readFile(
      resolve(fixtureDirectory, 'issue-19758-prompt-block.json'),
      'utf8',
    ),
    readFile(
      resolve(fixtureDirectory, 'issue-19758-prompt-block.chunks.txt'),
      'utf8',
    ),
  ]);

  const provider = createGoogleGenerativeAI({
    apiKey: 'test-api-key',
    fetch: async input => {
      const isStream = String(input).includes(':streamGenerateContent');

      return new Response(
        isStream ? `data: ${streamFixture.trim()}\n\n` : generateFixture,
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
      // Consume the stream so terminal promises resolve.
    }
    streamResult = {
      finishReason: await result.finishReason,
      promptFeedback: (await result.providerMetadata)?.google.promptFeedback,
    };
  } catch (error) {
    streamResult = { error: errorDetails(error) };
  }

  console.log(JSON.stringify({ generateResult, streamResult }, null, 2));

  if (
    !isExpectedPromptBlock(generateResult) ||
    !isExpectedPromptBlock(streamResult)
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
