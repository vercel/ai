import { google } from '@ai-sdk/google';
import { generateText } from 'ai';
import 'dotenv/config';

const models = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.5-pro',
] as const;

const penalties = [
  {
    name: 'frequencyPenalty',
    settings: { frequencyPenalty: 0.5 },
  },
  {
    name: 'presencePenalty',
    settings: { presencePenalty: 0.5 },
  },
] as const;

type ApiError = {
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
};

function getApiError(error: unknown): ApiError {
  const responseBody =
    typeof error === 'object' &&
    error != null &&
    'responseBody' in error &&
    typeof error.responseBody === 'string'
      ? error.responseBody
      : undefined;

  if (responseBody == null) {
    return {};
  }

  try {
    return JSON.parse(responseBody) as ApiError;
  } catch {
    return {};
  }
}

async function callDirectGoogleApi(
  model: (typeof models)[number],
  generationConfig: Record<string, number>,
) {
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
        generationConfig,
      }),
    },
  );

  return {
    status: response.status,
    body: (await response.json()) as ApiError,
  };
}

async function main() {
  for (const model of models) {
    const baseline = await generateText({
      model: google(model),
      prompt: 'Reply with OK.',
      maxOutputTokens: 64,
    });

    console.log(`${model} baseline: HTTP success (${baseline.finishReason})`);
  }

  const failures: Array<{
    model: (typeof models)[number];
    penalty: (typeof penalties)[number]['name'];
    statusCode: number | undefined;
    apiError: ApiError;
  }> = [];

  for (const model of models) {
    for (const penalty of penalties) {
      try {
        const result = await generateText({
          model: google(model),
          prompt: 'Reply with OK.',
          maxOutputTokens: 64,
          ...penalty.settings,
        });

        console.log(
          `${model} ${penalty.name}: succeeded with warnings ${JSON.stringify(
            result.warnings,
          )}`,
        );
      } catch (error) {
        const statusCode =
          typeof error === 'object' &&
          error != null &&
          'statusCode' in error &&
          typeof error.statusCode === 'number'
            ? error.statusCode
            : undefined;
        const apiError = getApiError(error);

        failures.push({
          model,
          penalty: penalty.name,
          statusCode,
          apiError,
        });

        console.log(
          `${model} ${penalty.name}: HTTP ${statusCode} ${apiError.error?.status} - ${apiError.error?.message}`,
        );
      }
    }
  }

  const directBaseline = await callDirectGoogleApi('gemini-2.5-flash', {});
  const directPenalty = await callDirectGoogleApi('gemini-2.5-flash', {
    frequencyPenalty: 0.5,
  });

  console.log(
    `direct Gemini baseline: HTTP ${directBaseline.status}; direct penalty: HTTP ${directPenalty.status} ${directPenalty.body.error?.status}`,
  );

  const reproduced =
    failures.length === models.length * penalties.length &&
    failures.every(
      failure =>
        failure.statusCode === 400 &&
        failure.apiError.error?.status === 'INVALID_ARGUMENT' &&
        failure.apiError.error.message ===
          `Penalty is not enabled for models/${failure.model}`,
    ) &&
    directBaseline.status === 200 &&
    directPenalty.status === 400 &&
    directPenalty.body.error?.status === 'INVALID_ARGUMENT';

  if (reproduced) {
    console.error(
      'ISSUE_8943_REPRODUCED: 6/6 Gemini 2.5 penalty calls failed with HTTP 400 INVALID_ARGUMENT',
    );
    process.exitCode = 1;
    return;
  }

  if (failures.length > 0) {
    throw new Error(
      `Unexpected provider result: ${JSON.stringify({
        failures,
        directBaseline,
        directPenalty,
      })}`,
    );
  }

  console.log(
    'Issue not reproduced: all Gemini 2.5 penalty calls completed without an API error.',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
