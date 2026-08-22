import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateText } from 'ai';

const models = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.5-pro',
] as const;

const penalties = [
  {
    directName: 'frequencyPenalty',
    sdkName: 'frequencyPenalty',
  },
  {
    directName: 'presencePenalty',
    sdkName: 'presencePenalty',
  },
] as const;

type JsonObject = Record<string, any>;

async function callGoogleDirectly({
  model,
  generationConfig,
}: {
  model: (typeof models)[number];
  generationConfig: JsonObject;
}) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': process.env.GOOGLE_GENERATIVE_AI_API_KEY!,
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: 'Reply with OK.' }] }],
        generationConfig: {
          maxOutputTokens: 16,
          ...generationConfig,
        },
      }),
    },
  );

  return {
    status: response.status,
    body: await response.json().catch(() => undefined),
  };
}

async function callThroughSdk({
  model,
  sdkName,
}: {
  model: (typeof models)[number];
  sdkName: (typeof penalties)[number]['sdkName'];
}) {
  let requestBody: JsonObject | undefined;
  let responseStatus: number | undefined;
  let responseBody: unknown;

  const google = createGoogleGenerativeAI({
    fetch: async (input, init) => {
      requestBody =
        typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
      const response = await fetch(input, init);
      responseStatus = response.status;
      responseBody = await response
        .clone()
        .json()
        .catch(() => undefined);
      return response;
    },
  });

  try {
    const result = await generateText({
      model: google(model),
      prompt: 'Reply with OK.',
      maxOutputTokens: 16,
      [sdkName]: 0.5,
    });

    return {
      outcome: 'success' as const,
      warnings: result.warnings,
      requestBody,
      responseStatus,
      responseBody,
    };
  } catch (error) {
    return {
      outcome: 'error' as const,
      error:
        error instanceof Error
          ? {
              name: error.name,
              message: error.message,
            }
          : String(error),
      requestBody,
      responseStatus,
      responseBody,
    };
  }
}

async function main() {
  const results = [];

  for (const model of models) {
    const baseline = await callGoogleDirectly({
      model,
      generationConfig: {},
    });

    for (const penalty of penalties) {
      const direct = await callGoogleDirectly({
        model,
        generationConfig: {
          [penalty.directName]: 0.5,
        },
      });
      const sdk = await callThroughSdk({
        model,
        sdkName: penalty.sdkName,
      });

      results.push({
        model,
        penalty: penalty.sdkName,
        baseline,
        direct,
        sdk,
      });
    }
  }

  console.log(JSON.stringify(results, null, 2));

  const reproducedAllCases = results.every(
    ({ model, penalty, baseline, direct, sdk }) =>
      baseline.status === 200 &&
      direct.status === 400 &&
      direct.body?.error?.status === 'INVALID_ARGUMENT' &&
      direct.body?.error?.message ===
        `Penalty is not enabled for models/${model}` &&
      sdk.outcome === 'error' &&
      sdk.responseStatus === 400 &&
      (sdk.responseBody as JsonObject | undefined)?.error?.status ===
        'INVALID_ARGUMENT' &&
      (sdk.responseBody as JsonObject | undefined)?.error?.message ===
        `Penalty is not enabled for models/${model}` &&
      sdk.requestBody?.generationConfig?.[penalty] === 0.5,
  );

  if (reproducedAllCases) {
    throw new Error(
      'Reproduced issue #8943: AI SDK requests with unsupported Gemini 2.5 penalties failed with INVALID_ARGUMENT instead of succeeding with unsupported warnings.',
    );
  }

  throw new Error(
    'Could not reproduce issue #8943 consistently across all reported Gemini 2.5 penalty cases.',
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
