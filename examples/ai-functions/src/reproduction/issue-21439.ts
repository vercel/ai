import { gateway } from 'ai';
import 'dotenv/config';

const models = [
  'zai/glm-5.3-flash',
  'zai/glm-5.3-flash',
  'zai/glm-5.3-flash',
  'deepseek/deepseek-v4.1-flash',
  'deepseek/deepseek-v4.1-flash',
  'deepseek/deepseek-v4.1-flash',
] as const;

type ErrorObservation = {
  name: unknown;
  message: unknown;
  cause: unknown;
  statusCode: unknown;
  json: string;
  string: string;
};

function observeError(error: unknown): ErrorObservation {
  const value =
    error != null && typeof error === 'object'
      ? (error as Record<string, unknown>)
      : {};

  let json: string;
  try {
    json = JSON.stringify(error);
  } catch {
    json = '<not JSON serializable>';
  }

  return {
    name: value.name,
    message: value.message,
    cause: value.cause,
    statusCode: value.statusCode,
    json,
    string: String(error),
  };
}

function summarizeGatewayMetadata(providerMetadata: unknown) {
  const metadata =
    providerMetadata != null && typeof providerMetadata === 'object'
      ? (providerMetadata as Record<string, unknown>)
      : {};
  const gateway =
    metadata.gateway != null && typeof metadata.gateway === 'object'
      ? (metadata.gateway as Record<string, unknown>)
      : {};
  const routing =
    gateway.routing != null && typeof gateway.routing === 'object'
      ? (gateway.routing as Record<string, unknown>)
      : {};

  return {
    generationId: gateway.generationId,
    resolvedProvider: routing.resolvedProvider,
    modelAttempts: routing.modelAttempts,
  };
}

function isCompleteWeatherInput(input: unknown): boolean {
  if (typeof input !== 'string') {
    return false;
  }

  try {
    const parsed = JSON.parse(input);
    return (
      parsed != null &&
      typeof parsed === 'object' &&
      typeof (parsed as { city?: unknown }).city === 'string' &&
      (parsed as { city: string }).city.length > 0
    );
  } catch {
    return false;
  }
}

async function runStream(modelId: (typeof models)[number], index: number) {
  const result = await gateway(modelId).doStream({
    prompt: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Call get_weather exactly once for San Francisco. Do not answer in text.',
          },
        ],
      },
    ],
    maxOutputTokens: 128,
    tools: [
      {
        type: 'function',
        name: 'get_weather',
        description: 'Get the weather for a city.',
        inputSchema: {
          type: 'object',
          properties: {
            city: { type: 'string' },
          },
          required: ['city'],
          additionalProperties: false,
        },
      },
    ],
    toolChoice: { type: 'tool', toolName: 'get_weather' },
    providerOptions: {
      gateway: {
        only: ['fireworks'],
      },
    },
  });

  const errors: ErrorObservation[] = [];
  const toolCalls: Array<{
    toolCallId: string;
    toolName: string;
    input: string;
  }> = [];
  let finishReason: unknown;
  let providerMetadata: unknown;

  for await (const part of result.stream) {
    if (part.type === 'error') {
      errors.push(observeError(part.error));
    } else if (part.type === 'tool-call') {
      toolCalls.push({
        toolCallId: part.toolCallId,
        toolName: part.toolName,
        input: part.input,
      });
    } else if (part.type === 'finish') {
      finishReason = part.finishReason;
      providerMetadata = part.providerMetadata;
    }
  }

  return {
    index,
    modelId,
    errors,
    toolCalls,
    finishReason,
    providerMetadata,
    hasTruncatedToolCall:
      finishReason === 'error' &&
      toolCalls.some(toolCall => !isCompleteWeatherInput(toolCall.input)),
  };
}

async function main() {
  let historicalGeneration: unknown;
  try {
    historicalGeneration = await gateway.getGenerationInfo({
      id: 'gen_01M38TX2GEN616SR9W22QXRWHP',
    });
  } catch (error) {
    historicalGeneration = observeError(error);
  }
  console.log(
    'HISTORICAL_GENERATION_LOOKUP',
    JSON.stringify(historicalGeneration),
  );

  const settled = await Promise.allSettled(
    models.map((modelId, index) => runStream(modelId, index)),
  );

  const rejected = settled.filter(
    (result): result is PromiseRejectedResult => result.status === 'rejected',
  );
  if (rejected.length > 0) {
    for (const result of rejected) {
      console.error('LIVE_PROVIDER_FAILURE', observeError(result.reason));
    }
    throw new Error(`${rejected.length} live Gateway streams rejected`);
  }

  const streams = settled.map(result => result.value);
  console.log(
    JSON.stringify(
      streams.map(stream => ({
        ...stream,
        providerMetadata: summarizeGatewayMetadata(stream.providerMetadata),
      })),
      null,
      2,
    ),
  );

  const errorParts = streams.flatMap(stream => stream.errors);
  const missingMessages = errorParts.filter(
    error => typeof error.message !== 'string' || error.message.length === 0,
  );
  const truncatedToolCalls = streams.filter(
    stream => stream.hasTruncatedToolCall,
  );

  console.log(
    `SUMMARY streams=${streams.length} errorParts=${errorParts.length} missingMessages=${missingMessages.length} truncatedToolCalls=${truncatedToolCalls.length}`,
  );

  if (missingMessages.length > 0) {
    console.error(
      'ISSUE_21439_REPRODUCED: in-stream Gateway error lost Error.message',
    );
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
