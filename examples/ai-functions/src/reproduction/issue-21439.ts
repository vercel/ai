import { gateway, type GatewayProviderOptions } from '@ai-sdk/gateway';
import { streamText, tool } from 'ai';
import { z } from 'zod';

const HISTORICAL_GENERATION_ID = 'gen_01M38TX2GEN616SR9W22QXRWHP';
const MODELS = ['zai/glm-5.3-flash', 'deepseek/deepseek-v4.1-flash'] as const;

type AttemptResult = {
  attempt: number;
  errors: unknown[];
  finishReason: string | undefined;
  model: (typeof MODELS)[number];
  providerMetadata: unknown;
  toolCalls: Array<{ input: unknown; toolName: string }>;
};

function errorMessage(error: unknown): string | undefined {
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error.message;
  }

  return undefined;
}

function errorProperty(error: unknown, property: string): unknown {
  return typeof error === 'object' && error !== null && property in error
    ? error[property as keyof typeof error]
    : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

function summarizeProviderMetadata(providerMetadata: unknown) {
  const gatewayMetadata = asRecord(asRecord(providerMetadata)?.gateway);
  const routing = asRecord(gatewayMetadata?.routing);
  const modelAttempts = Array.isArray(routing?.modelAttempts)
    ? routing.modelAttempts
    : [];

  return {
    generationId: gatewayMetadata?.generationId,
    finalProvider: routing?.finalProvider,
    modelAttempts: modelAttempts.map(modelAttempt => {
      const modelAttemptRecord = asRecord(modelAttempt);
      const providerAttempts = Array.isArray(
        modelAttemptRecord?.providerAttempts,
      )
        ? modelAttemptRecord.providerAttempts
        : [];

      return {
        canonicalSlug: modelAttemptRecord?.canonicalSlug,
        success: modelAttemptRecord?.success,
        providerAttempts: providerAttempts.map(providerAttempt => {
          const providerAttemptRecord = asRecord(providerAttempt);

          return {
            provider: providerAttemptRecord?.provider,
            success: providerAttemptRecord?.success,
            statusCode: providerAttemptRecord?.statusCode,
            error: providerAttemptRecord?.error,
          };
        }),
      };
    }),
  };
}

async function lookupHistoricalGeneration() {
  try {
    const generation = await gateway.getGenerationInfo({
      id: HISTORICAL_GENERATION_ID,
    });

    return { status: 'found', generation };
  } catch (error) {
    return {
      status: 'unavailable',
      name:
        typeof error === 'object' &&
        error !== null &&
        'name' in error &&
        typeof error.name === 'string'
          ? error.name
          : undefined,
      message: errorMessage(error) ?? String(error),
      statusCode: errorProperty(error, 'statusCode'),
      cause: errorMessage(errorProperty(error, 'cause')),
    };
  }
}

async function runAttempt(
  model: (typeof MODELS)[number],
  attempt: number,
): Promise<AttemptResult> {
  const result = streamText({
    model: gateway(model),
    maxOutputTokens: 512,
    maxRetries: 0,
    prompt:
      'Call getWeather exactly once for San Francisco. Do not answer with text.',
    providerOptions: {
      gateway: {
        only: ['fireworks'],
      } satisfies GatewayProviderOptions,
    },
    toolChoice: 'required',
    tools: {
      getWeather: tool({
        description: 'Get the weather for a city.',
        inputSchema: z.object({
          city: z.string(),
        }),
      }),
    },
  });

  const errors: unknown[] = [];
  const toolCalls: AttemptResult['toolCalls'] = [];
  let finishReason: string | undefined;
  let providerMetadata: unknown;

  for await (const part of result.fullStream) {
    if (part.type === 'error') {
      errors.push(part.error);
    } else if (part.type === 'tool-call') {
      toolCalls.push({
        toolName: part.toolName,
        input: part.input,
      });
    } else if (part.type === 'finish-step') {
      finishReason = part.finishReason;
      providerMetadata = part.providerMetadata;
    }
  }

  return {
    attempt,
    errors,
    finishReason,
    model,
    providerMetadata,
    toolCalls,
  };
}

async function main() {
  const historicalGeneration = await lookupHistoricalGeneration();
  const attempts = await Promise.all(
    Array.from({ length: 6 }, (_, index) =>
      runAttempt(MODELS[index % MODELS.length], index + 1),
    ),
  );

  const summary = {
    historicalGeneration,
    attempts: attempts.map(attempt => ({
      ...attempt,
      providerMetadata: summarizeProviderMetadata(attempt.providerMetadata),
      errors: attempt.errors.map(error => ({
        message: errorMessage(error),
        serialized: JSON.stringify(error),
        stringified: String(error),
      })),
    })),
  };

  console.log(JSON.stringify(summary, null, 2));

  const messageLessErrors = attempts.flatMap(attempt =>
    attempt.errors
      .filter(error => errorMessage(error) == null)
      .map(error => ({ attempt, error })),
  );

  if (messageLessErrors.length > 0) {
    throw new Error(
      'ISSUE_21439_REPRODUCED: Gateway in-stream error reached the client without Error.message',
    );
  }

  const failedAttempts = attempts.filter(
    attempt => attempt.errors.length > 0 || attempt.finishReason === 'error',
  );
  const truncatedToolCalls = failedAttempts.flatMap(attempt =>
    attempt.toolCalls
      .filter(
        toolCall =>
          typeof toolCall.input !== 'object' ||
          toolCall.input === null ||
          !('city' in toolCall.input) ||
          typeof toolCall.input.city !== 'string' ||
          toolCall.input.city.length === 0,
      )
      .map(toolCall => ({ attempt, toolCall })),
  );

  if (truncatedToolCalls.length > 0) {
    console.error(
      'ISSUE_21439_SECONDARY_OBSERVATION: a failed stream emitted a truncated complete-looking tool call',
    );
  }

  console.log(
    `issue-21439 result: ${attempts.length} streams, ${failedAttempts.length} error parts, ${messageLessErrors.length} message-less errors, ${truncatedToolCalls.length} truncated tool calls on failed streams`,
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
