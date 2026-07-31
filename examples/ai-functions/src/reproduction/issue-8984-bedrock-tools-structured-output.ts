import {
  createAmazonBedrock,
  type AmazonBedrockProviderSettings,
} from '@ai-sdk/amazon-bedrock';
import { generateText, isStepCount, Output, tool } from 'ai';
import { z } from 'zod';

const modelId = 'us.anthropic.claude-sonnet-4-5-20250929-v1:0';

async function main() {
  const requestBodies: Array<Record<string, unknown>> = [];
  const fetch: NonNullable<AmazonBedrockProviderSettings['fetch']> = async (
    input,
    init,
  ) => {
    if (typeof init?.body === 'string') {
      requestBodies.push(JSON.parse(init.body));
    }

    return globalThis.fetch(input, init);
  };

  const bedrock = createAmazonBedrock({
    region: 'us-east-1',
    fetch,
  });
  const secretMarker = `tool-result-${crypto.randomUUID()}`;
  let toolExecutionCount = 0;

  const result = await generateText({
    model: bedrock(modelId),
    prompt:
      'First call lookupMarker with key "issue-8984". After receiving its result, do not call it again. Return the marker from the tool result as the structured output.',
    tools: {
      lookupMarker: tool({
        description:
          'Looks up a private marker that is not available in the prompt.',
        inputSchema: z.object({
          key: z.literal('issue-8984'),
        }),
        execute: async () => {
          toolExecutionCount++;
          return { marker: secretMarker };
        },
      }),
    },
    output: Output.object({
      schema: z.object({
        marker: z.string(),
      }),
    }),
    stopWhen: isStepCount(4),
    prepareStep: ({ stepNumber }) =>
      stepNumber === 0
        ? {
            toolChoice: { type: 'tool', toolName: 'lookupMarker' },
          }
        : undefined,
  });

  const firstRequest = requestBodies[0] as
    | {
        toolConfig?: { tools?: unknown[] };
        additionalModelRequestFields?: {
          output_config?: { format?: unknown };
        };
      }
    | undefined;
  const warnings = result.steps.flatMap(step => step.warnings);
  const toolCalls = result.steps.flatMap(step => step.toolCalls);
  const toolResults = result.steps.flatMap(step => step.toolResults);

  const failures: string[] = [];

  if ((firstRequest?.toolConfig?.tools?.length ?? 0) === 0) {
    failures.push('the first Bedrock request omitted the user tool');
  }
  if (
    firstRequest?.additionalModelRequestFields?.output_config?.format == null
  ) {
    failures.push('the first Bedrock request omitted structured output');
  }
  if (toolExecutionCount === 0 || toolCalls.length === 0) {
    failures.push('the model did not call the user tool');
  }
  if (toolResults.length === 0) {
    failures.push('the user tool result was not returned to the model');
  }
  if (result.output.marker !== secretMarker) {
    failures.push(
      'the final structured output did not contain the tool result',
    );
  }
  if (
    warnings.some(warning =>
      JSON.stringify(warning).includes('provided tools are ignored'),
    )
  ) {
    failures.push('the SDK warned that the provided tools were ignored');
  }

  if (failures.length > 0) {
    throw new Error(`ISSUE_8984_REPRODUCED: ${failures.join('; ')}`);
  }

  console.log('ISSUE_8984_NOT_REPRODUCED');
  console.log(
    JSON.stringify(
      {
        modelId,
        steps: result.steps.length,
        toolCalls: toolCalls.length,
        toolResults: toolResults.length,
        toolExecutionCount,
        output: result.output,
        warnings,
      },
      null,
      2,
    ),
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
