import type { GatewayProviderOptions } from '@ai-sdk/gateway';
import { gateway, streamText, tool } from 'ai';
import { z } from 'zod';

const models = ['zai/glm-5.3-flash', 'deepseek/deepseek-v4.1-flash'] as const;

const lookup = tool({
  description: 'Look up a city code.',
  inputSchema: z.object({ city: z.string() }),
});

function serializedErrorDetails(error: unknown) {
  if (error == null || typeof error !== 'object') {
    return { name: undefined, message: undefined };
  }

  const value = error as { name?: unknown; message?: unknown };
  return {
    name: typeof value.name === 'string' ? value.name : undefined,
    message: typeof value.message === 'string' ? value.message : undefined,
  };
}

async function runStream(model: (typeof models)[number], attempt: number) {
  const result = streamText({
    model: gateway(model),
    prompt:
      'Call the lookup tool exactly once for San Francisco. Do not answer in text.',
    tools: { lookup },
    toolChoice: 'required',
    maxOutputTokens: 128,
    providerOptions: {
      gateway: {
        only: ['fireworks'],
      } satisfies GatewayProviderOptions,
    },
  });

  const toolCalls: Array<{ input: unknown }> = [];
  const errors: unknown[] = [];
  let finishReason: string | undefined;
  let finalProvider: string | undefined;

  for await (const part of result.fullStream) {
    if (part.type === 'tool-call') {
      toolCalls.push({ input: part.input });
    } else if (part.type === 'error') {
      errors.push(part.error);

      const { name, message } = serializedErrorDetails(part.error);
      if (!message) {
        throw new Error(
          `ISSUE_21439_REPRODUCED: ${model} attempt ${attempt} received an in-stream error without a message: ${JSON.stringify({ name })}`,
        );
      }
    } else if (part.type === 'finish-step') {
      finishReason = part.finishReason;
      finalProvider = (
        part.providerMetadata?.gateway as
          | { routing?: { finalProvider?: string } }
          | undefined
      )?.routing?.finalProvider;
    }
  }

  if (finalProvider !== 'fireworks') {
    throw new Error(
      `Scenario setup failed: expected Fireworks routing for ${model}, received ${String(finalProvider)}`,
    );
  }

  const hasTruncatedToolCall = toolCalls.some(
    call =>
      JSON.stringify(call.input) !== JSON.stringify({ city: 'San Francisco' }),
  );

  if (finishReason === 'error' && hasTruncatedToolCall) {
    throw new Error(
      `ISSUE_21439_SECONDARY_REPRODUCED: ${model} attempt ${attempt} emitted a truncated tool call before the stream error`,
    );
  }

  return {
    model,
    attempt,
    finishReason,
    errorCount: errors.length,
    toolCallCount: toolCalls.length,
  };
}

async function main() {
  const results = await Promise.all(
    models.flatMap(model =>
      Array.from({ length: 3 }, (_, index) => runStream(model, index + 1)),
    ),
  );

  console.log(JSON.stringify(results, null, 2));

  const errorCount = results.reduce(
    (total, result) => total + result.errorCount,
    0,
  );

  console.log(
    `Could not reproduce issue #21439: ${results.length}/${results.length} Fireworks streams completed without an in-stream error; observed ${errorCount} error parts.`,
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
