import { tool } from 'ai';
import { z } from 'zod/v4';
import { WorkflowAgent } from '../workflow-agent.js';
import { timeoutModel } from './timeout-model.js';

async function getTemperature(input: {
  city: string;
}): Promise<{ city: string; temperature: number }> {
  'use step';
  return { city: input.city, temperature: 18 };
}

export async function streamChunkTimeout() {
  'use workflow';
  const calls = { abortCalls: 0, errorCalls: 0, endCalls: 0 };
  const agent = new WorkflowAgent({ model: timeoutModel('stream-stall') });

  const result = await agent.stream({
    prompt: 'Say hello.',
    timeout: { chunkMs: 300 },
    onAbort: () => {
      calls.abortCalls++;
    },
    onError: () => {
      calls.errorCalls++;
    },
    onEnd: () => {
      calls.endCalls++;
    },
  });

  return { stepCount: result.steps.length, ...calls };
}

export async function streamTwoStepWithHeadroom() {
  'use workflow';
  const agent = new WorkflowAgent({
    model: timeoutModel('two-step'),
    tools: {
      getTemperature: tool({
        inputSchema: z.object({ city: z.string() }),
        execute: getTemperature,
      }),
    },
  });

  const result = await agent.stream({
    prompt: 'What is the temperature in London?',
    timeout: { stepMs: 1000, firstChunkMs: 1000, chunkMs: 1000 },
  });

  return {
    stepCount: result.steps.length,
    lastStepText: result.steps[result.steps.length - 1]?.text,
  };
}

export async function generateStepTimeout() {
  'use workflow';
  const agent = new WorkflowAgent({ model: timeoutModel('generate-stall') });

  try {
    const result = await agent.generate({
      prompt: 'Say hello.',
      timeout: { stepMs: 300 },
    });
    return { text: result.text };
  } catch (error) {
    return {
      errorName: (error as Error).name,
      errorMessage: (error as Error).message,
    };
  }
}
