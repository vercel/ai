import {
  createAnthropic,
  forwardAnthropicContainerIdFromLastStep,
} from '@ai-sdk/anthropic';
import { stepCountIs, streamText, tool } from 'ai';
import { z } from 'zod';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isAssistantPrefillError(error: unknown): boolean {
  return /assistant.*prefill|prefill.*assistant/i.test(errorMessage(error));
}

async function main() {
  const callbackErrors: unknown[] = [];
  const streamErrors: unknown[] = [];
  const requestLastRoles: string[] = [];
  const anthropic = createAnthropic({
    fetch: async (url, options) => {
      const body = JSON.parse(options?.body as string) as {
        messages?: Array<{ role?: string }>;
      };
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
    stopWhen: stepCountIs(10),
    prepareStep: forwardAnthropicContainerIdFromLastStep,
    onError: ({ error }) => {
      callbackErrors.push(error);
    },
  });

  const partTypes: string[] = [];
  let streamedText = '';
  for await (const part of result.fullStream) {
    partTypes.push(part.type);
    if (part.type === 'text-delta') {
      streamedText += part.text;
    } else if (part.type === 'error') {
      streamErrors.push(part.error);
    }
  }

  const steps = await result.steps;
  const text = await result.text;
  const errors = [...callbackErrors, ...streamErrors];

  console.log(
    JSON.stringify(
      {
        errors: errors.map(errorMessage),
        requestLastRoles,
        stepCount: steps.length,
        text,
        streamedText,
        partTypes,
      },
      null,
      2,
    ),
  );

  const prefillError = errors.find(isAssistantPrefillError);
  if (prefillError != null && streamedText.length > 0) {
    throw new Error(
      'ISSUE_13794_REPRODUCED: complete assistant output was followed by an assistant-prefill stream error',
    );
  }

  if (errors.length > 0) {
    throw new Error(`Unexpected provider error: ${errorMessage(errors[0])}`);
  }

  if (text.length === 0) {
    throw new Error('Expected a final user-visible answer');
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
