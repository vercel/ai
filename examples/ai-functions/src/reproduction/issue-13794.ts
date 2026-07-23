import {
  createAnthropic,
  forwardAnthropicContainerIdFromLastStep,
} from '@ai-sdk/anthropic';
import { parseJSON } from '@ai-sdk/provider-utils';
import { isStepCount, streamText, tool } from 'ai';
import { z } from 'zod';

async function main() {
  const errors: unknown[] = [];
  const requestLastRoles: string[] = [];
  const anthropic = createAnthropic({
    fetch: async (url, options) => {
      const body = await parseJSON<{
        messages?: Array<{ role?: string }>;
      }>({
        text: options?.body as string,
        schema: z.object({
          messages: z
            .array(z.object({ role: z.string().optional() }))
            .optional(),
        }),
      });
      const lastRole = body.messages?.at(-1)?.role;
      if (lastRole != null) {
        requestLastRoles.push(lastRole);
      }

      return fetch(url, options);
    },
  });

  const result = streamText({
    model: anthropic('claude-sonnet-4-6'),
    prompt:
      'Use code execution to call lookupNumber for ids 1, 2, and 3. ' +
      'Compute their sum in the code sandbox, then give a final one-sentence answer.',
    tools: {
      code_execution: anthropic.tools.codeExecution_20260120(),
      lookupNumber: tool({
        description: 'Return the number associated with an id.',
        inputSchema: z.object({ id: z.number().int().min(1).max(3) }),
        execute: async ({ id }) => id * 10,
        providerOptions: {
          anthropic: {
            allowedCallers: ['code_execution_20260120'],
          },
        },
      }),
    },
    stopWhen: isStepCount(10),
    prepareStep: forwardAnthropicContainerIdFromLastStep,
    onError: ({ error }) => {
      errors.push(error);
    },
  });

  const parts = [];
  for await (const part of result.fullStream) {
    parts.push(part);
  }

  const steps = await result.steps;
  const text = await result.text;

  console.log(
    JSON.stringify(
      {
        errors: errors.map(error =>
          error instanceof Error ? error.message : String(error),
        ),
        requestLastRoles,
        stepCount: steps.length,
        text,
        partTypes: parts.map(part => part.type),
      },
      null,
      2,
    ),
  );

  const prefillError = errors.find(error =>
    (error instanceof Error ? error.message : String(error)).includes(
      'does not support assistant message prefill',
    ),
  );

  if (prefillError != null) {
    throw new Error(
      'ISSUE_13794_REPRODUCED: Anthropic rejected the spurious assistant-last continuation',
    );
  }

  if (errors.length > 0) {
    throw new Error(
      `Unexpected provider error: ${
        errors[0] instanceof Error ? errors[0].message : String(errors[0])
      }`,
    );
  }

  if (text.length === 0) {
    throw new Error('Expected a final user-visible answer');
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
