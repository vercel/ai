import type { LanguageModelV4GenerateResult } from '@ai-sdk/provider';
import { Output, ToolLoopAgent, isStepCount, tool } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod/v4';
import { WorkflowAgent } from './workflow-agent.js';

function response(
  content: LanguageModelV4GenerateResult['content'],
  finishReason: LanguageModelV4GenerateResult['finishReason']['unified'] = 'stop',
): LanguageModelV4GenerateResult {
  return {
    content,
    finishReason: { unified: finishReason, raw: `raw-${finishReason}` },
    usage: {
      inputTokens: {
        total: 5,
        noCache: 2,
        cacheRead: 3,
        cacheWrite: undefined,
      },
      outputTokens: { total: 3, text: 1, reasoning: 2 },
    },
    warnings: [{ type: 'other', message: 'fixture' }],
    providerMetadata: { fixture: { retained: true } },
    request: { body: 'request-body' },
    response: {
      id: 'response-id',
      timestamp: new Date(0),
      modelId: 'response-model',
      headers: { 'x-fixture': 'value' },
      body: 'response-body',
    },
  };
}
function model(responses: LanguageModelV4GenerateResult[]) {
  return new MockLanguageModelV4({
    doGenerate: responses,
    doStream: () => {
      throw new Error('generate must not stream');
    },
  });
}
function tools() {
  return {
    lookup: tool({
      inputSchema: z.object({ city: z.string() }),
      execute: async ({ city }) => `weather in ${city}`,
    }),
  };
}
const call = {
  type: 'tool-call' as const,
  toolCallId: 'lookup-1',
  toolName: 'lookup',
  input: '{"city":"London"}',
};
const prompt = 'Find the weather.';

describe('WorkflowAgent.generate', () => {
  it('matches core multi-step results using only doGenerate', async () => {
    const responses = [
      response(
        [
          {
            type: 'reasoning',
            text: 'thinking',
            providerMetadata: { fixture: { thought: 1 } },
          },
          { type: 'text', text: 'Checking.' },
          call,
        ],
        'tool-calls',
      ),
      response([{ type: 'text', text: 'Sunny.' }]),
    ];
    const workflowModel = model(responses);
    const generated = await new WorkflowAgent({
      model: workflowModel,
      tools: tools(),
    }).generate({ prompt });
    const core = await new ToolLoopAgent({
      model: model(responses),
      tools: tools(),
    }).generate({ prompt });
    for (const field of [
      'content',
      'text',
      'toolCalls',
      'toolResults',
      'files',
      'sources',
      'warnings',
      'usage',
      'totalUsage',
      'finishReason',
      'rawFinishReason',
      'responseMessages',
      'output',
    ] as const) {
      expect(generated[field], field).toEqual(core[field]);
    }
    expect(generated.finalStep).toBe(generated.steps[1]);
    expect(workflowModel.doGenerateCalls).toHaveLength(2);
    expect(workflowModel.doStreamCalls).toHaveLength(0);
    expect(workflowModel.doGenerateCalls[1].prompt).toMatchObject([
      { role: 'user' },
      {
        role: 'assistant',
        content: [
          {
            type: 'reasoning',
            text: 'thinking',
            providerOptions: { fixture: { thought: 1 } },
          },
          { type: 'text' },
          { type: 'tool-call' },
        ],
      },
      { role: 'tool' },
    ]);
  });

  it('preserves ordered files, sources, reasoning and provider-executed results', async () => {
    const responses = [
      response([
        { type: 'text', text: 'Answer' },
        {
          type: 'file',
          mediaType: 'text/plain',
          data: { type: 'data', data: 'aGVsbG8=' },
        },
        {
          type: 'source',
          sourceType: 'url',
          id: 'source',
          url: 'https://example.com',
        },
        {
          type: 'tool-call',
          toolCallId: 'server',
          toolName: 'lookup',
          input: '{"city":"London"}',
          providerExecuted: true,
        },
        { type: 'reasoning', text: 'Reasoning' },
        {
          type: 'tool-result',
          toolCallId: 'server',
          toolName: 'lookup',
          result: { found: true },
        },
      ]),
    ];
    const generated = await new WorkflowAgent({
      model: model(responses),
      tools: tools(),
    }).generate({ prompt });
    const core = await new ToolLoopAgent({
      model: model(responses),
      tools: tools(),
    }).generate({ prompt });
    expect(generated.content.map(part => part.type)).toEqual(
      core.content.map(part => part.type),
    );
    expect(generated.files[0].base64).toBe(core.files[0].base64);
    expect(generated.toolResults).toEqual(core.toolResults);
    expect(generated.responseMessages).toEqual(core.responseMessages);
  });

  it('shares option precedence and tool lifecycle context without stream deltas', async () => {
    const events: string[] = [];
    const m = model([
      response([call], 'tool-calls'),
      response([{ type: 'text', text: 'Done' }]),
    ]);
    const agent = new WorkflowAgent({
      model: m,
      temperature: 0.1,
      prepareCall: options => ({ ...options, temperature: 0.2 }),
      runtimeContext: { userId: 'user' },
      tools: {
        lookup: tool({
          inputSchema: z.object({ city: z.string() }),
          contextSchema: z.object({ key: z.string() }),
          onInputStart: ({ context }) => {
            events.push(`start:${context.key}`);
          },
          onInputDelta: () => {
            events.push('delta');
          },
          onInputAvailable: ({ input, context }) => {
            events.push(`available:${input.city}:${context.key}`);
          },
          execute: async (_, { context }) => {
            events.push(`execute:${context.key}`);
            return 42;
          },
        }),
      },
      toolsContext: { lookup: { key: 'lookup-key' } },
      onEnd: () => {
        events.push('constructor-end');
      },
    });
    const result = await agent.generate({
      prompt,
      temperature: 0.3,
      onEnd: () => {
        events.push('call-end');
      },
    });
    expect(m.doGenerateCalls[0].temperature).toBe(0.3);
    expect(result.finalStep.runtimeContext).toEqual({ userId: 'user' });
    expect(events).toEqual([
      'start:lookup-key',
      'available:London:lookup-key',
      'execute:lookup-key',
      'constructor-end',
      'call-end',
    ]);
  });

  it('preserves generated history when prepareStep replaces the conversation', async () => {
    const generated = await new WorkflowAgent({
      model: model([
        response([call], 'tool-calls'),
        response([{ type: 'text', text: 'Done' }]),
      ]),
      tools: tools(),
      prepareStep: ({ stepNumber }) =>
        stepNumber === 1
          ? {
              messages: [
                {
                  role: 'user',
                  content: [{ type: 'text', text: 'Replacement' }],
                },
              ],
            }
          : {},
    }).generate({ prompt });
    expect(generated.responseMessages.map(message => message.role)).toEqual([
      'assistant',
      'tool',
      'assistant',
    ]);
    expect(generated.responseMessages[0]).toMatchObject({
      content: [{ toolCallId: 'lookup-1' }],
    });
  });

  it('defaults to 20 steps and honors an explicit limit', async () => {
    const responses = Array.from({ length: 21 }, () =>
      response([call], 'tool-calls'),
    );
    const generated = await new WorkflowAgent({
      model: model(responses),
      tools: tools(),
    }).generate({ prompt });
    expect(generated.steps).toHaveLength(20);
    expect(() => generated.output).toThrow(
      expect.objectContaining({ name: 'AI_NoOutputGeneratedError' }),
    );
    const limited = await new WorkflowAgent({
      model: model(responses),
      tools: tools(),
    }).generate({ prompt, stopWhen: isStepCount(2) });
    expect(limited.steps).toHaveLength(2);
  });

  it('returns client tools and invokes step-end before end without parsing tool-call output', async () => {
    const events: string[] = [];
    const generated = await new WorkflowAgent({
      model: model([
        response([{ type: 'text', text: '{' }, call], 'tool-calls'),
      ]),
      tools: { lookup: tool({ inputSchema: z.object({ city: z.string() }) }) },
      output: Output.object({ schema: z.object({ value: z.number() }) }),
      onStepEnd: () => {
        events.push('step');
      },
      onEnd: () => {
        events.push('end');
      },
    }).generate({ prompt });
    expect(generated.toolCalls).toHaveLength(1);
    expect(generated.toolResults).toEqual([]);
    expect(events).toEqual(['step', 'end']);
    expect(() => generated.output).toThrow(
      expect.objectContaining({ name: 'AI_NoOutputGeneratedError' }),
    );
  });

  it.each(['stop', 'length', 'content-filter', 'error', 'other'] as const)(
    'matches core output and response messages for finish reason %s',
    async finishReason => {
      const responses = [
        response([{ type: 'text', text: 'Answer' }], finishReason),
      ];
      const generated = await new WorkflowAgent({
        model: model(responses),
      }).generate({ prompt });
      const core = await new ToolLoopAgent({
        model: model(responses),
      }).generate({ prompt });
      expect(generated.output).toEqual(core.output);
      expect(generated.responseMessages).toEqual(core.responseMessages);
    },
  );

  it('parses empty stop output and runs onEnd before parsing', async () => {
    const events: string[] = [];
    const output = {
      ...Output.text(),
      async parseCompleteOutput({ text }: { text: string }) {
        events.push('parse');
        return text;
      },
    };
    const generated = await new WorkflowAgent({
      model: model([response([])]),
      output,
      onEnd: () => {
        events.push('end');
      },
    }).generate({ prompt });
    expect(generated.output).toBe('');
    expect(events).toEqual(['end', 'parse']);
  });

  it('runs onEnd before an output parse failure', async () => {
    const end = vi.fn();
    await expect(
      new WorkflowAgent({
        model: model([response([{ type: 'text', text: '{' }])]),
        output: Output.object({ schema: z.object({ value: z.number() }) }),
        onEnd: end,
      }).generate({ prompt }),
    ).rejects.toThrow();
    expect(end).toHaveBeenCalledOnce();
  });

  it.each([undefined, false, new Error('model failed')])(
    'rejects model failure %s without firing onEnd',
    async failure => {
      const end = vi.fn();
      const failedModel = new MockLanguageModelV4({
        doGenerate: async () => {
          throw failure;
        },
      });
      await expect(
        new WorkflowAgent({ model: failedModel, onEnd: end }).generate({
          prompt,
          maxRetries: 0,
        }),
      ).rejects.toBe(failure);
      expect(end).not.toHaveBeenCalled();
    },
  );

  it('preserves unknown usage counts and token details', async () => {
    const res = response([{ type: 'text', text: 'Answer' }]);
    res.usage = {
      inputTokens: {
        total: undefined,
        noCache: undefined,
        cacheRead: undefined,
        cacheWrite: undefined,
      },
      outputTokens: { total: undefined, text: undefined, reasoning: undefined },
    };
    const generated = await new WorkflowAgent({ model: model([res]) }).generate(
      { prompt },
    );
    const core = await new ToolLoopAgent({ model: model([res]) }).generate({
      prompt,
    });
    expect(generated.usage).toEqual(core.usage);
    expect(generated.usage.totalTokens).toBeUndefined();
  });

  it('retains metadata with opt-in bodies and omits them by default', async () => {
    const generated = await new WorkflowAgent({
      model: model([response([])]),
    }).generate({
      prompt,
      include: { requestBody: true, responseBody: true, requestMessages: true },
    });
    expect(generated.request).toMatchObject({
      body: 'request-body',
      messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
    });
    expect(generated.response).toMatchObject({
      id: 'response-id',
      timestamp: new Date(0),
      modelId: 'response-model',
      headers: { 'x-fixture': 'value' },
      body: 'response-body',
    });
    const omitted = await new WorkflowAgent({
      model: model([response([])]),
    }).generate({ prompt });
    expect(omitted.request.body).toBeUndefined();
    expect(omitted.response.body).toBeUndefined();
  });

  it('uses per-call output overrides', async () => {
    const generated = await new WorkflowAgent({
      model: model([response([{ type: 'text', text: 'Plain' }])]),
      output: Output.object({ schema: z.object({ value: z.number() }) }),
    }).generate({ prompt, output: Output.text() });
    expect(generated.output).toBe('Plain');
  });

  it('retains invalid calls and tool errors, then continues', async () => {
    const generated = await new WorkflowAgent({
      model: model([
        response([{ ...call, input: '{"city":123}' }], 'tool-calls'),
        response([{ type: 'text', text: 'Done' }]),
      ]),
      tools: tools(),
    }).generate({ prompt });
    expect(generated.toolCalls[0]).toMatchObject({
      invalid: true,
      dynamic: true,
    });
    expect(generated.content.map(part => part.type)).toEqual([
      'tool-call',
      'tool-error',
      'text',
    ]);
  });

  it('rejects an already-aborted invocation before model dispatch', async () => {
    const m = model([response([])]);
    await expect(
      new WorkflowAgent({ model: m }).generate({
        prompt,
        abortSignal: AbortSignal.abort(),
      }),
    ).rejects.toThrow();
    expect(m.doGenerateCalls).toHaveLength(0);
  });
});
