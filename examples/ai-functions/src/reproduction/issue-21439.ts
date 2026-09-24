import 'dotenv/config';
import type { GatewayProviderOptions } from '@ai-sdk/gateway';
import { streamText, tool } from 'ai';
import { z } from 'zod';

const models = [
  'zai/glm-5.3-flash',
  'zai/glm-5.3-flash',
  'zai/glm-5.3-flash',
  'deepseek/deepseek-v4.1-flash',
  'deepseek/deepseek-v4.1-flash',
  'deepseek/deepseek-v4.1-flash',
] as const;

type RunResult = {
  model: (typeof models)[number];
  errorParts: Array<unknown>;
  finishReasons: Array<string>;
  providerMetadata: Array<unknown>;
  toolCalls: Array<unknown>;
  toolCallsBeforeError: Array<unknown>;
};

function getMessage(error: unknown): string | undefined {
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

function collectRoutingErrors(value: unknown): Array<unknown> {
  if (Array.isArray(value)) {
    return value.flatMap(collectRoutingErrors);
  }

  if (typeof value !== 'object' || value === null) {
    return [];
  }

  return Object.entries(value).flatMap(([key, child]) =>
    key === 'error' ? [child] : collectRoutingErrors(child),
  );
}

function routingErrorHasMessage(error: unknown): boolean {
  if (getMessage(error) !== undefined) {
    return true;
  }

  if (typeof error !== 'string') {
    return false;
  }

  try {
    return getMessage(JSON.parse(error)) !== undefined;
  } catch {
    return error.length > 0 && error !== '[object Object]';
  }
}

async function runStream(model: (typeof models)[number]): Promise<RunResult> {
  const result = streamText({
    model,
    prompt:
      'Call getWeather exactly once for San Francisco. Do not answer with text.',
    maxOutputTokens: 100,
    tools: {
      getWeather: tool({
        description: 'Get the weather for a city.',
        inputSchema: z.object({
          city: z.string(),
        }),
      }),
    },
    providerOptions: {
      gateway: {
        only: ['fireworks'],
      } satisfies GatewayProviderOptions,
    },
  });

  const output: RunResult = {
    model,
    errorParts: [],
    finishReasons: [],
    providerMetadata: [],
    toolCalls: [],
    toolCallsBeforeError: [],
  };

  let errorSeen = false;
  for await (const part of result.fullStream) {
    switch (part.type) {
      case 'error':
        errorSeen = true;
        output.errorParts.push(part.error);
        break;
      case 'finish-step':
        output.finishReasons.push(part.finishReason);
        output.providerMetadata.push(part.providerMetadata);
        break;
      case 'finish':
        output.finishReasons.push(part.finishReason);
        break;
      case 'tool-call':
        output.toolCalls.push(part);
        if (!errorSeen) {
          output.toolCallsBeforeError.push(part);
        }
        break;
    }
  }

  return output;
}

async function main() {
  const settled = await Promise.allSettled(models.map(runStream));

  const rejected = settled.filter(
    (result): result is PromiseRejectedResult => result.status === 'rejected',
  );
  if (rejected.length > 0) {
    for (const rejection of rejected) {
      console.error(rejection.reason);
    }
    throw new Error(`${rejected.length} live Gateway request(s) rejected`);
  }

  const results = settled
    .filter(
      (result): result is PromiseFulfilledResult<RunResult> =>
        result.status === 'fulfilled',
    )
    .map(result => result.value);
  const errorParts = results.flatMap(result => result.errorParts);
  const routingErrors = results.flatMap(result =>
    result.providerMetadata.flatMap(collectRoutingErrors),
  );

  console.log(
    JSON.stringify(
      {
        streams: results.length,
        results: results.map(result => ({
          model: result.model,
          errorParts: result.errorParts.map((error: unknown) => ({
            serialized: JSON.stringify(error),
            stringified: String(error),
            message: getMessage(error),
          })),
          routingErrors: result.providerMetadata.flatMap(collectRoutingErrors),
          finishReasons: result.finishReasons,
          toolCalls: result.toolCalls,
          toolCallsBeforeError:
            result.errorParts.length > 0
              ? result.toolCallsBeforeError
              : undefined,
        })),
      },
      null,
      2,
    ),
  );

  const messageLessError = errorParts.find(
    error => getMessage(error) === undefined,
  );
  if (messageLessError !== undefined) {
    throw new Error(
      'ISSUE_21439_REPRODUCED: Gateway stream error part lost Error.message',
    );
  }

  const messageLessRoutingError = routingErrors.find(
    error => !routingErrorHasMessage(error),
  );
  if (messageLessRoutingError !== undefined) {
    throw new Error(
      'ISSUE_21439_REPRODUCED: Gateway routing metadata error lost Error.message',
    );
  }

  if (errorParts.length === 0) {
    console.log(
      'ISSUE_21439_NOT_REPRODUCED: all live streams completed without error parts',
    );
    return;
  }

  console.log(
    'ISSUE_21439_NOT_REPRODUCED: live error parts retained their messages',
  );
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
