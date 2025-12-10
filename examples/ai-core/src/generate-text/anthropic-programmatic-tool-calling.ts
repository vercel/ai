import { anthropic, AnthropicMessageMetadata } from '@ai-sdk/anthropic';
import { generateText, stepCountIs, tool } from 'ai';
import { z } from 'zod';
import { run } from '../lib/run';

run(async () => {
  const result = await generateText({
    model: anthropic('claude-sonnet-4-5'),
    prompt:
      'Query sales data for West, East, and Central regions, ' +
      'then tell me which region had the highest revenue',
    stopWhen: stepCountIs(10),
    tools: {
      code_execution: anthropic.tools.codeExecution_20250825(),

      queryDatabase: tool({
        description: 'Execute a SQL query against the sales database',
        inputSchema: z.object({
          sql: z.string().describe('SQL query to execute'),
        }),
        execute: async () => {
          return [
            { region: 'West', revenue: 45000 },
            { region: 'East', revenue: 38000 },
            { region: 'Central', revenue: 52000 },
          ];
        },
        providerOptions: {
          anthropic: {
            allowedCallers: ['code_execution_20250825'],
          },
        },
      }),
    },
    prepareStep: ({ steps }) => {
      if (steps.length === 0) {
        return undefined;
      }

      const lastStep = steps[steps.length - 1];
      const containerId = (
        lastStep.providerMetadata?.anthropic as
          | AnthropicMessageMetadata
          | undefined
      )?.container?.id;

      if (!containerId) {
        return undefined;
      }

      return {
        providerOptions: {
          anthropic: {
            container: { id: containerId },
          },
        },
      };
    },
  });

  console.log('Text:', result.text);
  console.log('Steps:', result.steps.length);
});
