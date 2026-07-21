import { google } from '@ai-sdk/google';
import { streamText, type LanguageModelUsage } from 'ai';

type ModelResult = {
  model: string;
  text: string;
  usage: LanguageModelUsage;
  finalUsageMetadata: Record<string, unknown> | undefined;
};

async function runModel(model: string): Promise<ModelResult> {
  const result = streamText({
    model: google(model),
    prompt: 'Reply with exactly: hello',
    maxOutputTokens: 256,
    includeRawChunks: true,
    onError: () => {},
  });

  let providerError: unknown;
  let text = '';
  let finalUsageMetadata: Record<string, unknown> | undefined;

  for await (const part of result.fullStream) {
    if (part.type === 'text-delta') {
      text += part.text;
    } else if (part.type === 'raw') {
      const raw = part.rawValue as {
        usageMetadata?: Record<string, unknown>;
      };
      finalUsageMetadata = raw.usageMetadata ?? finalUsageMetadata;
    } else if (part.type === 'error') {
      providerError = part.error;
    }
  }

  if (providerError != null) {
    throw providerError;
  }

  return {
    model,
    text,
    usage: await result.usage,
    finalUsageMetadata,
  };
}

function assertUsage(result: ModelResult) {
  if (result.text.length === 0) {
    throw new Error(`${result.model} returned no text`);
  }

  if (result.usage.outputTokens === 0) {
    throw new Error(
      `ISSUE_12013_REPRODUCED: ${result.model} returned non-empty text with outputTokens: 0`,
    );
  }

  if (
    result.usage.outputTokens == null ||
    result.usage.outputTokens < 1 ||
    result.finalUsageMetadata?.candidatesTokenCount == null
  ) {
    throw new Error(`${result.model} did not report output token usage`);
  }
}

async function main() {
  let reportedModelStatus = 'available';

  try {
    const reportedGemma = await runModel('gemma-3-12b-it');
    assertUsage(reportedGemma);
  } catch (error) {
    const statusCode =
      typeof error === 'object' && error != null && 'statusCode' in error
        ? error.statusCode
        : undefined;

    if (statusCode !== 404) {
      throw error;
    }

    reportedModelStatus = 'unavailable (HTTP 404)';
  }

  const gemma = await runModel('gemma-4-26b-a4b-it');
  const gemini = await runModel('gemini-2.5-flash');

  assertUsage(gemma);
  assertUsage(gemini);

  console.log(
    JSON.stringify(
      {
        reportedModel: {
          model: 'gemma-3-12b-it',
          status: reportedModelStatus,
        },
        supportedGemma: gemma,
        gemini,
      },
      null,
      2,
    ),
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
