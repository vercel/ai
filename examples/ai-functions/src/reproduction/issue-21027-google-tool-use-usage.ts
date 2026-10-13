import 'dotenv/config';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { streamText, stepCountIs } from 'ai';
import { readFile } from 'node:fs/promises';

const fixturePath =
  '../../packages/google/src/__fixtures__/google-tool-use-usage-issue-21027.chunks.txt';

async function main() {
  const fixture = await readFile(fixturePath, 'utf8');

  const google = createGoogleGenerativeAI({
    apiKey: 'reproduction-api-key',
    fetch: async () =>
      new Response(fixture, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      }),
  });

  const result = streamText({
    model: google('gemini-3.6-flash'),
    messages: [
      {
        role: 'user',
        content: 'Work out 7 + 7.5 + 6 and report it.',
      },
    ],
    stopWhen: stepCountIs(3),
    tools: {
      code_execution: google.tools.codeExecution({}),
    },
  });

  await result.consumeStream();
  const totalUsage = await result.totalUsage;
  const rawUsage = (await result.providerMetadata)?.google?.usageMetadata as
    | {
        promptTokenCount?: number;
        toolUsePromptTokenCount?: number;
        totalTokenCount?: number;
      }
    | undefined;

  if (
    rawUsage?.promptTokenCount == null ||
    rawUsage.toolUsePromptTokenCount == null ||
    rawUsage.totalTokenCount == null
  ) {
    throw new Error('Live fixture is missing required Google usage fields.');
  }

  const expectedInputTokens =
    rawUsage.promptTokenCount + rawUsage.toolUsePromptTokenCount;

  if (
    totalUsage.inputTokens !== expectedInputTokens ||
    totalUsage.inputTokenDetails.noCacheTokens !== expectedInputTokens ||
    totalUsage.totalTokens !== rawUsage.totalTokenCount
  ) {
    console.error(
      JSON.stringify(
        {
          googleUsage: rawUsage,
          sdkUsage: totalUsage,
          expectedInputTokens,
        },
        null,
        2,
      ),
    );
    throw new Error(
      'ISSUE_21027_REPRODUCED: AI SDK omits Google tool-use prompt tokens from reported usage',
    );
  }

  console.log('Google tool-use prompt tokens are included in SDK usage.');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
