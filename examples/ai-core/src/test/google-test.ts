import { google } from '@ai-sdk/google';
import { streamText, tool } from 'ai';
import { z } from 'zod';

// Case 1: Simple types (works)
const simpleSchema = z.object({
  text: z.string(),
  number: z.number(),
});

// Case 2: Optional fields in object (works)
const optionalObjectSchema = z.object({
  required: z.string(),
  optional: z.string().optional(),
});

// Case 3: Required array (works)
const requiredArraySchema = z.object({
  items: z.array(z.string()),
});

// Case 4: Optional array (fails)
const optionalArraySchema = z.object({
  items: z.array(z.string()).optional(),
});

// Case 5: Required enum (works)
const requiredEnumSchema = z.object({
  type: z.enum(['a', 'b', 'c']),
});

// Case 6: Optional enum (fails)
const optionalEnumSchema = z.object({
  type: z.enum(['a', 'b', 'c']).optional(),
});

export async function testLLMHandler() {
  const result = streamText({
    model: google('gemini-2.0-flash-exp', {
      structuredOutputs: true,
    }),
    system: 'You are a helpful assistant.',
    messages: [{ role: 'user', content: 'Hello!' }],
    tools: {
      // Works
      simple_tool: tool({
        description: 'A tool with simple types',
        parameters: simpleSchema,
        execute: async args => {
          return { success: true };
        },
      }),
      // Works
      optional_object_tool: tool({
        description: 'A tool with optional fields in an object',
        parameters: optionalObjectSchema,
        execute: async args => {
          return { success: true };
        },
      }),
      // Works
      required_array_tool: tool({
        description: 'A tool with a required array field',
        parameters: requiredArraySchema,
        execute: async args => {
          return { success: true };
        },
      }),
      // Fails
      optional_array_tool: tool({
        description: 'A tool with an optional array field',
        parameters: optionalArraySchema,
        execute: async args => {
          return { success: true };
        },
      }),
      // Works
      required_enum_tool: tool({
        description: 'A tool with a required enum field',
        parameters: requiredEnumSchema,
        execute: async args => {
          return { success: true };
        },
      }),
      // Fails
      optional_enum_tool: tool({
        description: 'A tool with an optional enum field',
        parameters: optionalEnumSchema,
        execute: async args => {
          return { success: true };
        },
      }),
    },
  });

  return result.toDataStreamResponse({
    getErrorMessage: error => {
      console.log('Error:', error);
      return error instanceof Error ? error.message : 'Unknown error';
    },
  });
}

import 'dotenv/config';

async function main() {
  const result = await testLLMHandler();
}

main().catch(console.error);
