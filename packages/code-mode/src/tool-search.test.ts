import { generateText, isStepCount, tool, toolSearch } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod/v4';
import { experimental_codeModeTool as codeModeTool } from '../dist/index.js';

describe('tool search through code mode', () => {
  it('discovers tools between sandbox executions and resets discovery between generations', async () => {
    const execute = vi.fn(({ city }: { city: string }) => ({
      city,
      forecast: 'rain',
    }));
    const tools = {
      code_mode: codeModeTool({ toolDiscovery: 'conversation' }),
      tool_search: toolSearch(),
      getForecast: tool({
        deferLoading: true,
        description: 'Weather forecast for a city',
        inputSchema: z.object({ city: z.string() }),
        execute,
      }),
      stockPrice: tool({
        deferLoading: true,
        description: 'Stock prices',
        inputSchema: z.object({ symbol: z.string() }),
        execute: () => 42,
      }),
    };
    for (let generation = 0; generation < 2; generation++) {
      const programs = [
        // Even guessing the name cannot call an undiscovered tool in this step.
        'const matches = await tools.tool_search({ query: "weather" }); try { await tools.getForecast({ city: "Bangalore" }); return { calledEarly: true }; } catch { return { matches, calledEarly: false }; }',
        'return await tools.getForecast({ city: "Bangalore" });',
      ];
      const model = new MockLanguageModelV4({
        doGenerate: async () => {
          const step = model.doGenerateCalls.length - 1;
          return {
            content: [
              {
                type: 'tool-call',
                toolCallId: `call-${step}`,
                toolName: 'code_mode',
                input: JSON.stringify({ js: programs[step] }),
              },
            ],
            finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
            usage: {
              inputTokens: {
                total: 1,
                noCache: 1,
                cacheRead: undefined,
                cacheWrite: undefined,
              },
              outputTokens: { total: 1, text: 1, reasoning: undefined },
            },
            warnings: [],
          };
        },
      });
      const result = await generateText({
        model,
        tools,
        experimental_toolCallers: {
          tool_search: ['code_mode'],
          getForecast: ['code_mode'],
          stockPrice: ['code_mode'],
        },
        prompt: 'Get the weather in Bangalore.',
        stopWhen: isStepCount(2),
      });
      expect(result.steps[0].toolResults[0].output).toEqual({
        matches: {
          tools: [
            { name: 'getForecast', description: 'Weather forecast for a city' },
          ],
        },
        calledEarly: false,
      });
      expect(result.steps[1].toolResults[0].output).toEqual({
        city: 'Bangalore',
        forecast: 'rain',
      });
      expect(execute).toHaveBeenCalledTimes(generation + 1);
      const [first, second] = model.doGenerateCalls;
      expect(first.tools?.map(tool => tool.name)).toEqual(['code_mode']);
      expect(second.tools).toEqual(first.tools);
      expect(JSON.stringify(first.prompt)).not.toContain('getForecast');
      expect(JSON.stringify(second.prompt)).toContain('getForecast');
      expect(JSON.stringify(second.prompt)).not.toContain('stockPrice');
      expect(second.prompt.slice(0, first.prompt.length)).toEqual(first.prompt);
    }
  });

  it('rejects search with description discovery before calling the model', async () => {
    const model = new MockLanguageModelV4();
    await expect(
      generateText({
        model,
        tools: { code_mode: codeModeTool(), search: toolSearch() },
        experimental_toolCallers: { search: ['code_mode'] },
        prompt: 'Search tools',
      }),
    ).rejects.toThrow("toolDiscovery: 'conversation'");
    expect(model.doGenerateCalls).toHaveLength(0);
  });
});
