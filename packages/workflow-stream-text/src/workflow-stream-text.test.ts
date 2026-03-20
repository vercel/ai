import { LanguageModelV4Usage } from '@ai-sdk/provider';
import {
  convertArrayToReadableStream,
  convertReadableStreamToArray,
} from '@ai-sdk/provider-utils/test';
import { MockLanguageModelV4 } from 'ai/test';
import { describe, expect, it } from 'vitest';
import { workflowStreamText } from './workflow-stream-text';

const testUsage: LanguageModelV4Usage = {
  inputTokens: {
    total: 10,
    noCache: 10,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: {
    total: 5,
    reasoning: undefined,
    text: 5,
  },
};

describe('workflowStreamText', () => {
  it('should yield a single step for simple text generation', async () => {
    const generator = workflowStreamText({
      model: new MockLanguageModelV4({
        doStream: async () => ({
          stream: convertArrayToReadableStream([
            { type: 'text-start', id: '1' },
            { type: 'text-delta', id: '1', delta: 'Hello World' },
            { type: 'text-end', id: '1' },
            {
              type: 'finish',
              finishReason: { unified: 'stop', raw: 'stop' },
              usage: testUsage,
            },
          ]),
        }),
      }),
      messages: [{ role: 'user', content: 'hello' }],
    });

    const steps = [];
    for await (const step of generator) {
      // Consume the stream
      await convertReadableStreamToArray(step.stream);
      const stepResult = await step.stepResult;
      steps.push(stepResult);
    }

    expect(steps).toHaveLength(1);
    expect(steps[0].text).toBe('Hello World');
    expect(steps[0].finishReason).toBe('stop');
  });

  it('should yield multiple steps when tool calls are present', async () => {
    let callCount = 0;

    const generator = workflowStreamText({
      model: new MockLanguageModelV4({
        doStream: async () => {
          callCount++;
          if (callCount === 1) {
            return {
              stream: convertArrayToReadableStream([
                {
                  type: 'tool-call',
                  toolCallId: 'tc-1',
                  toolName: 'search',
                  input: '{"query":"test"}',
                },
                {
                  type: 'finish',
                  finishReason: { unified: 'tool-calls', raw: 'tool_use' },
                  usage: testUsage,
                },
              ]),
            };
          }
          return {
            stream: convertArrayToReadableStream([
              { type: 'text-start', id: '1' },
              {
                type: 'text-delta',
                id: '1',
                delta: 'Based on search results...',
              },
              { type: 'text-end', id: '1' },
              {
                type: 'finish',
                finishReason: { unified: 'stop', raw: 'stop' },
                usage: testUsage,
              },
            ]),
          };
        },
      }),
      messages: [{ role: 'user', content: 'search for something' }],
      maxSteps: 3,
    });

    const steps = [];
    for await (const step of generator) {
      await convertReadableStreamToArray(step.stream);
      const stepResult = await step.stepResult;
      steps.push(stepResult);
    }

    expect(steps).toHaveLength(2);
    expect(steps[0].toolCalls).toHaveLength(1);
    expect(steps[0].toolCalls[0].toolName).toBe('search');
    expect(steps[1].text).toBe('Based on search results...');
  });

  it('should stop at maxSteps even with tool calls', async () => {
    const generator = workflowStreamText({
      model: new MockLanguageModelV4({
        doStream: async () => ({
          stream: convertArrayToReadableStream([
            {
              type: 'tool-call',
              toolCallId: 'tc-1',
              toolName: 'search',
              input: '{"query":"test"}',
            },
            {
              type: 'finish',
              finishReason: { unified: 'tool-calls', raw: 'tool_use' },
              usage: testUsage,
            },
          ]),
        }),
      }),
      messages: [{ role: 'user', content: 'hello' }],
      maxSteps: 1,
    });

    const steps = [];
    for await (const step of generator) {
      await convertReadableStreamToArray(step.stream);
      const stepResult = await step.stepResult;
      steps.push(stepResult);
    }

    // Should stop after 1 step even though there are tool calls
    expect(steps).toHaveLength(1);
  });

  it('should provide step numbers', async () => {
    let callCount = 0;

    const generator = workflowStreamText({
      model: new MockLanguageModelV4({
        doStream: async () => {
          callCount++;
          if (callCount === 1) {
            return {
              stream: convertArrayToReadableStream([
                {
                  type: 'tool-call',
                  toolCallId: 'tc-1',
                  toolName: 'search',
                  input: '{}',
                },
                {
                  type: 'finish',
                  finishReason: { unified: 'tool-calls', raw: 'tool_use' },
                  usage: testUsage,
                },
              ]),
            };
          }
          return {
            stream: convertArrayToReadableStream([
              { type: 'text-start', id: '1' },
              { type: 'text-delta', id: '1', delta: 'done' },
              { type: 'text-end', id: '1' },
              {
                type: 'finish',
                finishReason: { unified: 'stop', raw: 'stop' },
                usage: testUsage,
              },
            ]),
          };
        },
      }),
      messages: [{ role: 'user', content: 'hello' }],
      maxSteps: 3,
    });

    const stepNumbers = [];
    for await (const step of generator) {
      stepNumbers.push(step.stepNumber);
      await convertReadableStreamToArray(step.stream);
      await step.stepResult;
    }

    expect(stepNumbers).toEqual([0, 1]);
  });

  it('should resolve toolCalls promise before stepResult', async () => {
    const generator = workflowStreamText({
      model: new MockLanguageModelV4({
        doStream: async () => ({
          stream: convertArrayToReadableStream([
            {
              type: 'tool-call',
              toolCallId: 'tc-1',
              toolName: 'myTool',
              input: '{"x":1}',
            },
            {
              type: 'finish',
              finishReason: { unified: 'tool-calls', raw: 'tool_use' },
              usage: testUsage,
            },
          ]),
        }),
      }),
      messages: [{ role: 'user', content: 'hello' }],
      maxSteps: 1,
    });

    for await (const step of generator) {
      // Consume stream to trigger resolution
      await convertReadableStreamToArray(step.stream);

      const toolCalls = await step.toolCalls;
      expect(toolCalls).toHaveLength(1);
      expect(toolCalls[0]).toMatchObject({
        toolCallId: 'tc-1',
        toolName: 'myTool',
      });
    }
  });

  it('should default to stopping after 1 step', async () => {
    const generator = workflowStreamText({
      model: new MockLanguageModelV4({
        doStream: async () => ({
          stream: convertArrayToReadableStream([
            {
              type: 'tool-call',
              toolCallId: 'tc-1',
              toolName: 'search',
              input: '{}',
            },
            {
              type: 'finish',
              finishReason: { unified: 'tool-calls', raw: 'tool_use' },
              usage: testUsage,
            },
          ]),
        }),
      }),
      messages: [{ role: 'user', content: 'hello' }],
      // no maxSteps, no stopWhen => default is stepCountIs(1)
    });

    const steps = [];
    for await (const step of generator) {
      await convertReadableStreamToArray(step.stream);
      steps.push(await step.stepResult);
    }

    expect(steps).toHaveLength(1);
  });
});
