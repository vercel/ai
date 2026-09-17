import { readFile } from 'node:fs/promises';
import { createGoogle } from '@ai-sdk/google';
import { stepCountIs, streamText } from 'ai';

type GoogleResponse = {
  usageMetadata: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    toolUsePromptTokenCount: number;
    thoughtsTokenCount: number;
    totalTokenCount: number;
    cachedContentTokenCount?: number;
  };
};

async function main() {
  const fixturePath = new URL(
    '../../../../packages/google/src/__fixtures__/google-tool-use-usage.json',
    import.meta.url,
  );
  const googleResponse = JSON.parse(
    await readFile(fixturePath, 'utf8'),
  ) as GoogleResponse;

  const google = createGoogle({
    apiKey: 'fixture-api-key',
    fetch: async () =>
      new Response(`data: ${JSON.stringify(googleResponse)}\n\n`, {
        headers: { 'content-type': 'text/event-stream' },
        status: 200,
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
    tools: { code_execution: google.tools.codeExecution({}) },
  });

  await result.consumeStream();

  const sdkUsage = await result.totalUsage;
  const providerUsage = googleResponse.usageMetadata;
  const expectedInputTokens =
    providerUsage.promptTokenCount + providerUsage.toolUsePromptTokenCount;
  const expectedNoCacheTokens =
    expectedInputTokens - (providerUsage.cachedContentTokenCount ?? 0);

  if (sdkUsage.totalTokens !== providerUsage.totalTokenCount) {
    throw new Error(
      `BUG: SDK totalTokens ${sdkUsage.totalTokens} does not match Google totalTokenCount ${providerUsage.totalTokenCount} (missing toolUsePromptTokenCount ${providerUsage.toolUsePromptTokenCount})`,
    );
  }

  if (sdkUsage.inputTokens !== expectedInputTokens) {
    throw new Error(
      `SDK inputTokens ${sdkUsage.inputTokens} does not include all Google input tokens ${expectedInputTokens}`,
    );
  }

  if (sdkUsage.inputTokenDetails.noCacheTokens !== expectedNoCacheTokens) {
    throw new Error(
      `SDK noCacheTokens ${sdkUsage.inputTokenDetails.noCacheTokens} does not match expected uncached input ${expectedNoCacheTokens}`,
    );
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
