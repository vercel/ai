import { DurableAgent, toUIMessageChunk } from '@ai-sdk/durable-agent';
import type { LanguageModelV4StreamPart } from '@ai-sdk/provider';
import {
  convertToModelMessages,
  generateId,
  type UIMessage,
  type UIMessageChunk,
} from 'ai';
import { getWritable } from 'workflow';
import z from 'zod';

// ============================================================================
// Tool step functions — these run as durable steps with full Node.js access
// ============================================================================

async function getWeather(input: { city: string }): Promise<{
  city: string;
  temperature: number;
  unit: string;
  condition: string;
}> {
  'use step';
  // Fake weather data based on city name
  const hash = input.city
    .toLowerCase()
    .split('')
    .reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const temperature = 40 + (hash % 60); // 40-99°F
  const conditions = [
    'sunny',
    'cloudy',
    'rainy',
    'snowy',
    'windy',
    'partly cloudy',
  ];
  const condition = conditions[hash % conditions.length];
  return { city: input.city, temperature, unit: 'fahrenheit', condition };
}

async function calculate(input: {
  expression: string;
}): Promise<{ expression: string; result: number }> {
  'use step';
  // Only allow numbers, operators, parentheses, and whitespace
  const translated = input.expression.replace(/\s/g, '').replace(/\^/g, '**');
  if (!/^[0-9+\-*/().]+$/.test(translated)) {
    throw new Error(`Invalid expression: ${input.expression}`);
  }
  const result = new Function(`return (${translated})`)() as number;
  return { expression: input.expression, result };
}

// ============================================================================
// Chat workflow — orchestrates the DurableAgent
// ============================================================================

export async function chat(messages: UIMessage[]) {
  'use workflow';

  const modelMessages = await convertToModelMessages(messages);

  const agent = new DurableAgent({
    model: 'anthropic/claude-sonnet-4-20250514',
    instructions:
      'You are a helpful assistant with access to weather and calculator tools. Use them when the user asks about weather in a city or needs math calculations. Keep responses concise.',
    tools: {
      getWeather: {
        description:
          'Get the current weather for a city. Returns temperature in Fahrenheit and conditions.',
        inputSchema: z.object({
          city: z.string().describe('The city name to get weather for'),
        }),
        execute: getWeather,
      },
      calculate: {
        description:
          'Evaluate a simple math expression. Supports +, -, *, /, and parentheses.',
        inputSchema: z.object({
          expression: z
            .string()
            .describe('The math expression to evaluate, e.g. "2 + 3 * 4"'),
        }),
        execute: calculate,
      },
    },
    onStepFinish: async stepResult => {
      console.log('[agent-chat] step finished:', {
        finishReason: stepResult.finishReason,
        text: stepResult.text?.slice(0, 100),
      });
    },
    onFinish: async event => {
      console.log('[agent-chat] finished:', {
        finishReason: event.finishReason,
        steps: event.steps.length,
      });
    },
  });

  // Stream the agent — returns raw model data, no UI coupling
  const result = await agent.stream({
    messages: modelMessages,
  });

  // Convert raw chunks to UIMessageChunks and write to the workflow writable
  // await writeUIChunks(result.rawChunks);

  return { messages: result.messages };
}
