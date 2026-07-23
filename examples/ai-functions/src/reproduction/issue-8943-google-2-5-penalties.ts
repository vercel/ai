import { createGoogle } from '@ai-sdk/google';
import { generateText } from 'ai';

type ModelId = 'gemini-2.5-flash' | 'gemini-2.5-flash-lite' | 'gemini-2.5-pro';
type Penalty = 'frequencyPenalty' | 'presencePenalty';

type RecordedCall = {
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

async function main() {
  const calls: RecordedCall[] = [];
  let currentScenario: { modelId: ModelId; penalty?: Penalty };

  const google = createGoogle({
    fetch: async (input, init) => {
      const response = await fetch(input, init);
      const responseBody = await response
        .clone()
        .json()
        .catch(() => undefined);

      calls.push({
        ...currentScenario,
        requestBody:
          typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body,
        responseBody,
        status: response.status,
      });

      return response;
    },
  });

  const failures: Array<{
    modelId: ModelId;
    penalty: Penalty;
    message: string;
  }> = [];

  for (const modelId of models) {
    for (const penalty of penalties) {
      currentScenario = { modelId, penalty };

      try {
        await generateText({
          model: google(modelId),
          prompt: 'Reply with OK.',
          maxOutputTokens: 8,
          [penalty]: 0.5,
        });
      } catch {
        const call = calls.at(-1);
        const message =
          typeof call?.responseBody === 'object' &&
          call.responseBody != null &&
          'error' in call.responseBody &&
          typeof call.responseBody.error === 'object' &&
          call.responseBody.error != null &&
          'message' in call.responseBody.error &&
          typeof call.responseBody.error.message === 'string'
            ? call.responseBody.error.message
            : 'unknown error';

        failures.push({ modelId, penalty, message });
      }
    }
  }

  const controls: Array<{ modelId: ModelId; text: string }> = [];
  for (const modelId of models) {
    currentScenario = { modelId };
    const result = await generateText({
      model: google(modelId),
      prompt: 'Reply with OK.',
      maxOutputTokens: 8,
    });
    controls.push({ modelId, text: result.text });
  }

  console.log(
    JSON.stringify(
      {
        failures,
        controls,
        calls,
      },
      null,
      2,
    ),
  );

  const expectedFailures = models.flatMap(modelId =>
    penalties.map(penalty => ({
      modelId,
      penalty,
      message: `Penalty is not enabled for models/${modelId}`,
    })),
  );

  if (JSON.stringify(failures) === JSON.stringify(expectedFailures)) {
    throw new Error(
      'Reproduced issue #8943: Gemini 2.5 Flash, Flash-Lite, and Pro reject AI SDK frequencyPenalty and presencePenalty requests.',
    );
  }

  throw new Error(
    `Could not reproduce issue #8943 exactly; observed ${failures.length} matching provider failures.`,
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
