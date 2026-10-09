import { tool, type ModelMessage } from 'ai';
import { createHook, getWritable } from 'workflow';
import { z } from 'zod/v4';
import { WorkflowAgent } from '../workflow-agent.js';
import {
  generationBoundaryModel,
  type BoundaryScenario,
} from './generation-boundary-model.js';

async function closeTrace() {
  'use step';
  const writer = getWritable().getWriter();
  try {
    await writer.close();
  } finally {
    writer.releaseLock();
  }
}

export async function generateAtBoundary(
  scenario: BoundaryScenario,
  timeout?: number,
) {
  'use workflow';
  const agent = new WorkflowAgent({
    model: generationBoundaryModel(scenario),
    maxRetries: 2,
  });
  try {
    const result = await agent.generate({
      prompt: 'Test generation.',
      timeout,
    });
    return { text: result.text };
  } catch (error) {
    return {
      errorName: (error as Error).name,
      errorMessage: (error as Error).message,
    };
  } finally {
    await closeTrace();
  }
}

export async function generateAcrossDeadline(timeout: number) {
  'use workflow';
  const agent = new WorkflowAgent({
    model: generationBoundaryModel('hook'),
    tools: {
      wait: tool({
        inputSchema: z.object({}),
        execute: async () => {
          using hook = createHook<string>();
          return await hook;
        },
      }),
    },
  });
  try {
    const result = await agent.generate({
      prompt: 'Wait for the user.',
      timeout,
    });
    return { text: result.text };
  } catch (error) {
    return { errorName: (error as Error).name };
  } finally {
    await closeTrace();
  }
}

export async function generateSerializableFields(include: boolean) {
  'use workflow';
  const agent = new WorkflowAgent({ model: generationBoundaryModel('rich') });
  const result = await agent.generate({
    prompt: 'Return rich content.',
    include: {
      requestBody: include,
      responseBody: include,
      requestMessages: include,
    },
  });
  using hook = createHook<string>();
  await hook;
  await closeTrace();
  return {
    text: result.text,
    output: result.output,
    contentTypes: result.content.map(part => part.type),
    file: {
      base64: result.files[0].base64,
      bytes: result.files[0].uint8Array,
      mediaType: result.files[0].mediaType,
    },
    sources: result.sources,
    response: {
      ...result.finalStep.response,
      messages: result.finalStep.response.messages as ModelMessage[],
    },
    request: result.finalStep.request,
    usage: result.usage,
    warnings: result.warnings,
    providerMetadata: result.finalStep.providerMetadata,
    responseMessages: result.responseMessages as ModelMessage[],
  };
}
