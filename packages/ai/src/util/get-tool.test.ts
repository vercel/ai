import { tool } from '@ai-sdk/provider-utils';
import { describe, expect, it } from 'vitest';
import z from 'zod';
import { getTool } from './get-tool';

describe('getTool', () => {
  it('gets tool by name attribute', () => {
    const tools = {
      weatherTool: tool({ name: 'weather', inputSchema: z.object({}) }),
      bashTool: tool({ name: 'bash', inputSchema: z.object({}) }),
    };

    const weather = getTool('weather', tools);
    expect(weather).toBeDefined();

    const bash = getTool('bash', tools);
    expect(bash).toBeDefined();

    const weatherTool = getTool('weatherTool', tools);
    expect(weatherTool).toBeDefined();
  });

  it('gets tool by key value when name is undefined', () => {
    const tools = {
      weatherTool: tool({ inputSchema: z.object({}) }),
      bashTool: tool({ inputSchema: z.object({}) }),
    };

    const weather = getTool('weatherTool', tools);
    expect(weather).toBeDefined();

    const bash = getTool('bashTool', tools);
    expect(bash).toBeDefined();

    const errorTool = getTool('error-tool', tools);
    expect(errorTool).toBeUndefined();
  });
});
