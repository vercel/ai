import { generateText, streamText } from 'ai';
import { expect, it } from 'vitest';
import { z } from 'zod';
import { describeIfCapability } from '../capability-test-utils';
import type { TestFunction } from './index';

function safeEvaluateMathExpression(expression: string): number {
  // Remove any whitespace and validate it only contains safe mathematical expressions
  const sanitized = expression.replace(/\s+/g, '');
  if (!/^[0-9+\-*/().]+$/.test(sanitized)) {
    throw new Error('Invalid mathematical expression');
  }
  // Use Function instead of eval for better security
  // This creates a new scope and prevents access to global context
  return new Function(`return ${sanitized}`)() as number;
}

export const run: TestFunction<'toolCalls'> = ({
  model,
  capabilities,
  skipUsage,
}) => {
  describeIfCapability(capabilities, ['toolCalls'], 'Tool Calls', () => {
    it('should generate text with tool calls', async () => {
      const result = await generateText({
        model,
        prompt: 'What is 2+2? Use the calculator tool to compute this.',
        tools: {
          calculator: {
            parameters: z.object({
              expression: z
                .string()
                .describe('The mathematical expression to evaluate'),
            }),
            execute: async ({ expression }) =>
              safeEvaluateMathExpression(expression).toString(),
          },
        },
      });

      expect(result.toolCalls?.[0]).toMatchObject({
        toolName: 'calculator',
        args: { expression: '2+2' },
      });
      expect(result.toolResults?.[0].result).toBe('4');
      if (!skipUsage) {
        expect(result.usage?.totalTokens).toBeGreaterThan(0);
      }
    });

    it('should stream text with tool calls', async () => {
      let toolCallCount = 0;
      const result = streamText({
        model,
        prompt: 'What is 2+2? Use the calculator tool to compute this.',
        tools: {
          calculator: {
            parameters: z.object({
              expression: z.string(),
            }),
            execute: async ({ expression }) => {
              toolCallCount++;
              return safeEvaluateMathExpression(expression).toString();
            },
          },
        },
      });

      const parts = [];
      for await (const part of result.fullStream) {
        parts.push(part);
      }

      expect(parts.some(part => part.type === 'tool-call')).toBe(true);
      expect(toolCallCount).toBe(1);
      if (!skipUsage) {
        expect((await result.usage).totalTokens).toBeGreaterThan(0);
      }
    });

    it('should handle multiple sequential tool calls', async () => {
      let weatherCalls = 0;
      let musicCalls = 0;
      const sfTemp = 15;
      const result = await generateText({
        model,
        prompt:
          'Check the temperature in San Francisco and play music that matches the weather. Be sure to report the chosen song name.',
        tools: {
          getTemperature: {
            parameters: z.object({
              city: z.string().describe('The city to check temperature for'),
            }),
            execute: async ({ city }) => {
              weatherCalls++;
              return `${sfTemp}`;
            },
          },
          playWeatherMusic: {
            parameters: z.object({
              temperature: z.number().describe('Temperature in Celsius'),
            }),
            execute: async ({ temperature }) => {
              musicCalls++;
              if (temperature <= 10) {
                return 'Playing "Winter Winds" by Mumford & Sons';
              } else if (temperature <= 20) {
                return 'Playing "Foggy Day" by Frank Sinatra';
              } else if (temperature <= 30) {
                return 'Playing "Here Comes the Sun" by The Beatles';
              } else {
                return 'Playing "Hot Hot Hot" by Buster Poindexter';
              }
            },
          },
        },
        maxSteps: 10,
      });

      expect(weatherCalls).toBe(1);
      expect(musicCalls).toBe(1);
      expect(result.text).toContain('Foggy Day');
    });
  });
};
