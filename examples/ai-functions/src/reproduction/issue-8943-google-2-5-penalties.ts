import { createGoogle } from '@ai-sdk/google';
import { generateText } from 'ai';

type ModelId = 'gemini-2.5-flash' | 'gemini-2.5-flash-lite' | 'gemini-2.5-pro';
type Penalty = 'frequencyPenalty' | 'presencePenalty';

type GoogleErrorBody = {
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
};

type RecordedSdkCall = {
  modelId: ModelId;
  penalty?: Penalty;
  requestBody: unknown;
  responseBody: unknown;
  status: number;
};

const models: ModelId[] = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.5-pro',
];
const penalties: Penalty[] = ['frequencyPenalty', 'presencePenalty'];

function getGenerationConfig(body: unknown): Record<string, unknown> {
  if (
    typeof body !== 'object' ||
    body == null ||
    !('generationConfig' in body) ||
    typeof body.generationConfig !== 'object' ||
    body.generationConfig == null
  ) {
    return {};
  }

  return body.generationConfig as Record<string, unknown>;
}

function getGoogleError(body: unknown): GoogleErrorBody['error'] {
  if (
    typeof body !== 'object' ||
    body == null ||
    !('error' in body) ||
    typeof body.error !== 'object' ||
    body.error == null
  ) {
    return undefined;
  }

  return body.error as GoogleErrorBody['error'];
}

async function callGoogleDirectly({
  modelId,
  generationConfig,
}: {
  modelId: ModelId;
  generationConfig: Record<string, number>;
}) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': process.env.GOOGLE_GENERATIVE_AI_API_KEY!,
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: 'Reply with OK.' }],
          },
        ],
        generationConfig,
      }),
    },
  );

  return {
    status: response.status,
    body: (await response.json()) as unknown,
  };
}

async function main() {
  const directBaseline = await callGoogleDirectly({
    modelId: 'gemini-2.5-flash',
    generationConfig: {},
  });
  const directPenalty = await callGoogleDirectly({
    modelId: 'gemini-2.5-flash',
    generationConfig: { frequencyPenalty: 0.5 },
  });
  const directPenaltyError = getGoogleError(directPenalty.body);

  if (
    directBaseline.status !== 200 ||
    directPenalty.status !== 400 ||
    directPenaltyError?.status !== 'INVALID_ARGUMENT' ||
    directPenaltyError.message !==
      'Penalty is not enabled for models/gemini-2.5-flash'
  ) {
    throw new Error(
      `Unexpected direct Gemini API behavior: ${JSON.stringify({
        directBaseline,
        directPenalty,
      })}`,
    );
  }

  console.log(
    'Direct Gemini API check: baseline HTTP 200; frequencyPenalty HTTP 400 INVALID_ARGUMENT.',
  );

  const sdkCalls: RecordedSdkCall[] = [];
  let currentScenario:
    | {
        modelId: ModelId;
        penalty?: Penalty;
      }
    | undefined;

  const google = createGoogle({
    fetch: async (input, init) => {
      if (currentScenario == null) {
        throw new Error('Missing SDK reproduction scenario.');
      }

      const response = await fetch(input, init);
      const responseBody = await response
        .clone()
        .json()
        .catch(() => undefined);

      sdkCalls.push({
        ...currentScenario,
        requestBody:
          typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body,
        responseBody,
        status: response.status,
      });

      return response;
    },
  });

  for (const modelId of models) {
    currentScenario = { modelId };
    const result = await generateText({
      model: google(modelId),
      prompt: 'Reply with OK.',
      maxOutputTokens: 64,
    });

    console.log(`${modelId} baseline succeeded (${result.finishReason}).`);
  }

  const providerFailures: Array<{
    modelId: ModelId;
    penalty: Penalty;
    message: string;
  }> = [];

  for (const modelId of models) {
    for (const penalty of penalties) {
      currentScenario = { modelId, penalty };

      try {
        const result = await generateText({
          model: google(modelId),
          prompt: 'Reply with OK.',
          maxOutputTokens: 64,
          [penalty]: 0.5,
        });

        const call = sdkCalls.at(-1);
        const generationConfig = getGenerationConfig(call?.requestBody);
        const hasWarning =
          result.warnings?.some(
            warning =>
              warning.type === 'unsupported' && warning.feature === penalty,
          ) ?? false;

        if (
          call?.status !== 200 ||
          generationConfig.frequencyPenalty != null ||
          generationConfig.presencePenalty != null ||
          !hasWarning
        ) {
          throw new Error(
            `Gemini 2.5 penalty call succeeded without the expected omission and unsupported warning: ${JSON.stringify(
              {
                modelId,
                penalty,
                status: call?.status,
                generationConfig,
                warnings: result.warnings,
              },
            )}`,
          );
        }

        console.log(
          `${modelId} ${penalty}: succeeded after omitting the setting and returning an unsupported warning.`,
        );
      } catch (error) {
        const call = sdkCalls.at(-1);
        const generationConfig = getGenerationConfig(call?.requestBody);
        const providerError = getGoogleError(call?.responseBody);
        const message = `Penalty is not enabled for models/${modelId}`;

        if (
          call?.modelId !== modelId ||
          call.penalty !== penalty ||
          call.status !== 400 ||
          providerError?.code !== 400 ||
          providerError.status !== 'INVALID_ARGUMENT' ||
          providerError.message !== message ||
          generationConfig[penalty] !== 0.5
        ) {
          throw error;
        }

        providerFailures.push({ modelId, penalty, message });
        console.log(
          `${modelId} ${penalty}: HTTP 400 INVALID_ARGUMENT - ${message}`,
        );
      }
    }
  }

  if (providerFailures.length > 0) {
    console.error(
      `ISSUE_8943_REPRODUCED: ${providerFailures.length}/${
        models.length * penalties.length
      } Gemini 2.5 penalty calls failed with HTTP 400 INVALID_ARGUMENT`,
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    'Issue #8943 not reproduced: all Gemini 2.5 penalty calls succeeded with unsupported warnings.',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
