import { openai } from '@ai-sdk/openai';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-node';
import { ToolLoopAgent, tool, stepCountIs } from 'ai';
import { z } from 'zod';
import { run } from '../lib/run';

const sdk = new NodeSDK({
  traceExporter: new ConsoleSpanExporter(),
  instrumentations: [getNodeAutoInstrumentations()],
});

sdk.start();

run(async () => {
  const childAgent = new ToolLoopAgent({
    model: openai('gpt-4-turbo'),
    instructions:
      'You are a helpful child agent. Call the simple_tool twice, then provide a summary.',
    tools: {
      simple_tool: tool({
        description: 'A simple tool that returns a result',
        inputSchema: z.object({
          input: z.string().optional().describe('Optional input'),
        }),
        execute: ({ input }) => {
          return `Tool result for: ${input || 'default'}`;
        },
      }),
    },
    stopWhen: stepCountIs(3),
    experimental_telemetry: {
      isEnabled: true,
      functionId: 'child-agent',
      metadata: {
        agentType: 'child',
        agentLevel: 'L2',
      },
    },
  });

  const parentAgent = new ToolLoopAgent({
    model: openai('gpt-4-turbo'),
    instructions:
      'You are the main agent. Delegate the task to the child agent using call_child tool.',
    tools: {
      call_child: tool({
        description: 'Calls the child agent to handle a sub-task',
        inputSchema: z.object({
          task: z.string().describe('The task for the child agent'),
        }),
        execute: async ({ task }) => {
          const result = await childAgent.stream({
            prompt: task,
          });

          return await result.text;
        },
      }),
    },
    stopWhen: stepCountIs(3),
    experimental_telemetry: {
      isEnabled: true,
      functionId: 'parent-agent',
      metadata: {
        agentType: 'parent',
        agentLevel: 'L1',
      },
    },
  });

  const result = await parentAgent.stream({
    prompt:
      'Please ask the child agent to process some data and call the simple_tool a few times.',
  });

  console.log(await result.text);

  await sdk.shutdown();
});
