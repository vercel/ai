import { google } from '@ai-sdk/google';
import { APICallError, streamText } from 'ai';

const reportedGemmaModel = 'gemma-3-12b-it';
const currentGemmaModel = 'gemma-4-26b-a4b-it';
const comparisonGeminiModel = 'gemini-2.5-flash';

type Observation = {
  model: string;
  text: string;
  usage: Awaited<ReturnType<typeof streamText>['usage']>;
  usageMetadata: unknown;
  rawUsageMetadata: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

async function observe(model: string): Promise<Observation> {
  const result = streamText({
    model: google(model),
    maxOutputTokens: 256,
    prompt: 'Reply with exactly: hello',
    includeRawChunks: true,
    onError: () => {},
  });

  let text = '';
  let rawUsageMetadata: unknown;

  for await (const chunk of result.fullStream) {
    if (chunk.type === 'text-delta') {
      text += chunk.text;
    } else if (chunk.type === 'raw' && isRecord(chunk.rawValue)) {
      rawUsageMetadata = chunk.rawValue.usageMetadata ?? rawUsageMetadata;
    } else if (chunk.type === 'error') {
      throw chunk.error;
    }
  }

  const [usage, providerMetadata] = await Promise.all([
    result.usage,
    result.providerMetadata,
  ]);

  return {
    model,
    text,
    usage,
    usageMetadata: providerMetadata?.google?.usageMetadata,
    rawUsageMetadata,
  };
}

function assertNoZeroOutputTokens(observation: Observation) {
  if (observation.text.length > 0 && observation.usage.outputTokens === 0) {
    throw new Error(
      `Reproduced issue #12013: ${observation.model} streamed non-empty text but reported outputTokens: 0.`,
    );
  }
}

async function main() {
  let reportedModelUnavailable = false;
  let gemmaObservation: Observation;

  try {
    gemmaObservation = await observe(reportedGemmaModel);
  } catch (error) {
    if (APICallError.isInstance(error) && error.statusCode === 404) {
      reportedModelUnavailable = true;
      gemmaObservation = await observe(currentGemmaModel);
    } else {
      throw error;
    }
  }

  const geminiObservation = await observe(comparisonGeminiModel);

  console.log(
    JSON.stringify(
      {
        reportedModelUnavailable,
        gemma: gemmaObservation,
        gemini: geminiObservation,
      },
      null,
      2,
    ),
  );

  assertNoZeroOutputTokens(gemmaObservation);
  assertNoZeroOutputTokens(geminiObservation);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
