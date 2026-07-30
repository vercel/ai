import {
  openai,
  type OpenAILanguageModelResponsesOptions,
  type OpenAIToolOptions,
} from '@ai-sdk/openai';
import { tool, ToolLoopAgent, type InferAgentUIMessage } from 'ai';
import { z } from 'zod';

const inventoryOutputSchema: NonNullable<OpenAIToolOptions['outputSchema']> = {
  type: 'object',
  properties: {
    sku: { type: 'string' },
    availableUnits: { type: 'number' },
  },
  required: ['sku', 'availableUnits'],
  additionalProperties: false,
};

const demandOutputSchema: NonNullable<OpenAIToolOptions['outputSchema']> = {
  type: 'object',
  properties: {
    sku: { type: 'string' },
    requestedUnits: { type: 'number' },
  },
  required: ['sku', 'requestedUnits'],
  additionalProperties: false,
};

export const openaiProgrammaticToolCallingAgent = new ToolLoopAgent({
  model: openai.responses('gpt-5.6'),
  instructions:
    'You are an inventory planning assistant. Use the hosted JavaScript program to coordinate eligible tools when answering inventory questions. Call independent tools in parallel when possible, and explain the result clearly.',
  tools: {
    program: openai.tools.programmaticToolCalling(),
    getInventory: tool({
      description: 'Get available inventory for a SKU.',
      inputSchema: z.object({
        sku: z.string(),
      }),
      outputSchema: z.object({
        sku: z.string(),
        availableUnits: z.number(),
      }),
      execute: async ({ sku }) => ({
        sku,
        availableUnits: 42,
      }),
      providerOptions: {
        openai: {
          allowedCallers: ['programmatic'],
          outputSchema: inventoryOutputSchema,
        } satisfies OpenAIToolOptions,
      },
    }),
    getDemand: tool({
      description: 'Get requested units for a SKU.',
      inputSchema: z.object({
        sku: z.string(),
      }),
      outputSchema: z.object({
        sku: z.string(),
        requestedUnits: z.number(),
      }),
      execute: async ({ sku }) => ({
        sku,
        requestedUnits: 31,
      }),
      providerOptions: {
        openai: {
          allowedCallers: ['programmatic'],
          outputSchema: demandOutputSchema,
        } satisfies OpenAIToolOptions,
      },
    }),
  },
  providerOptions: {
    openai: {
      store: true,
    } satisfies OpenAILanguageModelResponsesOptions,
  },
});

export type OpenAIProgrammaticToolCallingMessage = InferAgentUIMessage<
  typeof openaiProgrammaticToolCallingAgent
>;
