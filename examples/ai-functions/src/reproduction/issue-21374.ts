import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { APICallError, generateText, streamText } from 'ai';

type InferenceConfig = Record<string, unknown>;

type CapturedCall = {
  input: RequestInfo | URL;
  init?: RequestInit;
  requestBody?: {
    inferenceConfig?: InferenceConfig;
  };
  responseStatus?: number;
  responseBody?: string;
};

type Observation = {
  name: string;
  modelId: string;
  mode: 'generate' | 'stream';
  status: 'ok' | 'unsupported-field';
  inferenceConfig?: InferenceConfig;
  unsupportedField?: 'temperature' | 'topP' | 'stopSequences';
  warnings?: string[];
};

const calls: CapturedCall[] = [];

const bedrock = createAmazonBedrock({
  region: 'us-east-1',
  fetch: async (input, init) => {
    const call: CapturedCall = {
      input,
      init,
      requestBody:
        typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    };
    calls.push(call);

    const response = await fetch(input, init);
    call.responseStatus = response.status;
    call.responseBody = await response
      .clone()
      .text()
      .catch(() => undefined);
    return response;
  },
});

async function runCase({
  name,
  modelId,
  mode = 'generate',
  temperature,
  topP,
  topK,
  stopSequences,
}: {
  name: string;
  modelId: string;
  mode?: 'generate' | 'stream';
  temperature?: number;
  topP?: number;
  topK?: number;
  stopSequences?: string[];
}): Promise<Observation> {
  const callIndex = calls.length;

  try {
    if (mode === 'stream') {
      const result = streamText({
        model: bedrock(modelId),
        prompt: 'Count from 1 to 2.',
        maxOutputTokens: 16,
        temperature,
        topP,
        topK,
        stopSequences,
        onError: () => {},
      });
      await result.text;
    } else {
      const result = await generateText({
        model: bedrock(modelId),
        prompt: 'Say ok.',
        maxOutputTokens: 16,
        temperature,
        topP,
        topK,
        stopSequences,
      });

      return {
        name,
        modelId,
        mode,
        status: 'ok',
        inferenceConfig: calls[callIndex]?.requestBody?.inferenceConfig,
        warnings: (result.warnings ?? []).flatMap(warning =>
          warning.type === 'unsupported' ? [warning.feature] : [],
        ),
      };
    }

    return {
      name,
      modelId,
      mode,
      status: 'ok',
      inferenceConfig: calls[callIndex]?.requestBody?.inferenceConfig,
    };
  } catch (error) {
    const capturedResponse = calls[callIndex];
    const responseBody = APICallError.isInstance(error)
      ? error.responseBody
      : capturedResponse?.responseBody;
    const statusCode = APICallError.isInstance(error)
      ? error.statusCode
      : capturedResponse?.responseStatus;

    if (statusCode === 400) {
      const unsupportedField = (
        ['temperature', 'topP', 'stopSequences'] as const
      ).find(field =>
        responseBody?.includes(`This model doesn't support the ${field} field`),
      );

      if (unsupportedField != null) {
        return {
          name,
          modelId,
          mode,
          status: 'unsupported-field',
          unsupportedField,
          inferenceConfig: calls[callIndex]?.requestBody?.inferenceConfig,
        };
      }
    }

    throw error;
  }
}

async function replayWithoutTemperature(
  observation: Observation,
): Promise<{ status: number; body: string }> {
  const call = calls.find(
    candidate =>
      candidate.requestBody?.inferenceConfig === observation.inferenceConfig,
  );
  if (call?.requestBody == null) {
    throw new Error('Expected to capture the failed Bedrock request.');
  }

  const directBody = structuredClone(call.requestBody);
  delete directBody.inferenceConfig?.temperature;
  const response = await fetch(call.input, {
    ...call.init,
    body: JSON.stringify(directBody),
  });

  return { status: response.status, body: await response.text() };
}

async function main() {
  const affectedCases = [
    {
      name: 'GPT-6 Sol regional temperature 0.2',
      modelId: 'us.openai.gpt-6-sol',
      temperature: 0.2,
    },
    {
      name: 'GPT-6 Sol regional temperature 0',
      modelId: 'us.openai.gpt-6-sol',
      temperature: 0,
    },
    {
      name: 'GPT-6 Sol regional temperature 1',
      modelId: 'us.openai.gpt-6-sol',
      temperature: 1,
    },
    {
      name: 'GPT-6 Sol global temperature',
      modelId: 'global.openai.gpt-6-sol',
      temperature: 0.2,
    },
    {
      name: 'GPT-6 Luna regional temperature',
      modelId: 'us.openai.gpt-6-luna',
      temperature: 0.2,
    },
    {
      name: 'GPT-6 Luna global temperature',
      modelId: 'global.openai.gpt-6-luna',
      temperature: 0.2,
    },
    {
      name: 'GPT-6 Sol topP',
      modelId: 'us.openai.gpt-6-sol',
      topP: 0.5,
    },
    {
      name: 'GPT-6 Luna stop sequence',
      modelId: 'us.openai.gpt-6-luna',
      stopSequences: ['END'],
    },
    {
      name: 'GPT-6 Luna empty stop sequences',
      modelId: 'us.openai.gpt-6-luna',
      stopSequences: [],
    },
    {
      name: 'GPT-6 Sol stream temperature',
      modelId: 'us.openai.gpt-6-sol',
      mode: 'stream' as const,
      temperature: 0.2,
    },
    {
      name: 'GPT-5.6 Sol temperature',
      modelId: 'us.openai.gpt-5.6-sol',
      temperature: 0.2,
    },
    {
      name: 'GPT-5.6 Sol topP',
      modelId: 'us.openai.gpt-5.6-sol',
      topP: 0.5,
    },
    {
      name: 'gpt-oss stop sequence',
      modelId: 'openai.gpt-oss-120b-1:0',
      stopSequences: ['END'],
    },
    {
      name: 'gpt-oss empty stop sequences',
      modelId: 'openai.gpt-oss-120b-1:0',
      stopSequences: [],
    },
  ];

  const controlCases = [
    {
      name: 'GPT-6 Sol plain call',
      modelId: 'us.openai.gpt-6-sol',
    },
    {
      name: 'GPT-6 Sol topK',
      modelId: 'us.openai.gpt-6-sol',
      topK: 5,
    },
    {
      name: 'gpt-oss temperature',
      modelId: 'openai.gpt-oss-120b-1:0',
      temperature: 0.2,
    },
    {
      name: 'gpt-oss topP',
      modelId: 'openai.gpt-oss-120b-1:0',
      topP: 0.5,
    },
    {
      name: 'Claude temperature',
      modelId: 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
      temperature: 0.2,
    },
    {
      name: 'Claude topP',
      modelId: 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
      topP: 0.5,
    },
    {
      name: 'Claude stop sequence',
      modelId: 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
      stopSequences: ['END'],
    },
    {
      name: 'Claude empty stop sequences',
      modelId: 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
      stopSequences: [],
    },
  ];

  const affected = [];
  for (const testCase of affectedCases) {
    affected.push(await runCase(testCase));
  }

  const controls = [];
  for (const testCase of controlCases) {
    controls.push(await runCase(testCase));
  }

  const failedControls = controls.filter(result => result.status !== 'ok');
  if (failedControls.length > 0) {
    throw new Error(
      `Control calls unexpectedly failed: ${JSON.stringify(failedControls)}`,
    );
  }

  const temperatureFailure = affected.find(
    result =>
      result.modelId === 'us.openai.gpt-5.6-sol' &&
      result.unsupportedField === 'temperature',
  );
  const directWithoutTemperature =
    temperatureFailure == null
      ? undefined
      : await replayWithoutTemperature(temperatureFailure);

  console.log(
    JSON.stringify(
      {
        affected,
        controls,
        directWithoutTemperature,
      },
      null,
      2,
    ),
  );

  const unsupportedFailures = affected.filter(
    result => result.status === 'unsupported-field',
  );
  if (
    unsupportedFailures.length > 0 &&
    directWithoutTemperature?.status === 200
  ) {
    throw new Error(
      'ISSUE_21374_REPRODUCED: Amazon Bedrock rejected supported OpenAI Converse calls because AI SDK forwarded unsupported sampling fields.',
    );
  }

  if (unsupportedFailures.length > 0) {
    throw new Error(
      'Observed unsupported sampling field failures, but the direct provider comparison did not succeed.',
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
