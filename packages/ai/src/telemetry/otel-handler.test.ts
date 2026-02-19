import { describe, it, expect, beforeEach } from 'vitest';
import { MockTracer } from '../test/mock-tracer';
import { createOtelHandler } from './otel-handler';
import { TelemetryHandler } from './telemetry-handler';
import { LanguageModelUsage } from '../types/usage';

const testUsage: LanguageModelUsage = {
  inputTokens: 10,
  inputTokenDetails: {
    noCacheTokens: 8,
    cacheReadTokens: 2,
    cacheWriteTokens: undefined,
  },
  outputTokens: 20,
  outputTokenDetails: {
    textTokens: 15,
    reasoningTokens: 5,
  },
  totalTokens: 30,
};

const testResponse = {
  id: 'resp-1',
  modelId: 'mock-model-id',
  timestamp: new Date(0),
};

const testModel = {
  provider: 'mock-provider',
  modelId: 'mock-model-id',
};

const testSettings = {
  maxOutputTokens: 100,
  temperature: 0.7,
  topP: undefined,
  topK: undefined,
  presencePenalty: undefined,
  frequencyPenalty: undefined,
  stopSequences: undefined,
  seed: undefined,
  maxRetries: 2,
};

describe('createOtelHandler', () => {
  let tracer: MockTracer;
  let handler: TelemetryHandler;

  beforeEach(() => {
    tracer = new MockTracer();
    handler = createOtelHandler({
      telemetry: {
        isEnabled: true,
        tracer,
      },
    });
  });

  it('should create root span on onStart', async () => {
    await handler.onStart({
      model: testModel,
      system: 'You are helpful.',
      prompt: 'Hello',
      messages: undefined,
      settings: testSettings,
      functionId: undefined,
      metadata: undefined,
    });

    expect(tracer.spans).toHaveLength(1);
    expect(tracer.spans[0].name).toBe('ai.generateText');
    expect(tracer.spans[0].attributes['ai.model.provider']).toBe(
      'mock-provider',
    );
    expect(tracer.spans[0].attributes['ai.model.id']).toBe('mock-model-id');
    expect(tracer.spans[0].attributes['ai.settings.maxRetries']).toBe(2);
    expect(tracer.spans[0].attributes['ai.settings.maxOutputTokens']).toBe(100);
    expect(tracer.spans[0].attributes['ai.prompt']).toBe(
      JSON.stringify({
        system: 'You are helpful.',
        prompt: 'Hello',
        messages: undefined,
      }),
    );
    expect(tracer.spans[0].attributes['operation.name']).toBe(
      'ai.generateText',
    );
    expect(tracer.spans[0].attributes['ai.operationId']).toBe(
      'ai.generateText',
    );
  });

  it('should include functionId in operation name', async () => {
    const handlerWithFunctionId = createOtelHandler({
      telemetry: {
        isEnabled: true,
        tracer,
        functionId: 'my-function',
      },
    });

    await handlerWithFunctionId.onStart({
      model: testModel,
      system: undefined,
      prompt: 'test',
      messages: undefined,
      settings: testSettings,
      functionId: 'my-function',
      metadata: undefined,
    });

    expect(tracer.spans[0].attributes['operation.name']).toBe(
      'ai.generateText my-function',
    );
    expect(tracer.spans[0].attributes['ai.telemetry.functionId']).toBe(
      'my-function',
    );
    expect(tracer.spans[0].attributes['resource.name']).toBe('my-function');
  });

  it('should include metadata as telemetry attributes', async () => {
    const handlerWithMetadata = createOtelHandler({
      telemetry: {
        isEnabled: true,
        tracer,
        metadata: { env: 'test', version: '1.0' },
      },
    });

    await handlerWithMetadata.onStart({
      model: testModel,
      system: undefined,
      prompt: 'test',
      messages: undefined,
      settings: testSettings,
      functionId: undefined,
      metadata: { env: 'test', version: '1.0' },
    });

    expect(tracer.spans[0].attributes['ai.telemetry.metadata.env']).toBe(
      'test',
    );
    expect(tracer.spans[0].attributes['ai.telemetry.metadata.version']).toBe(
      '1.0',
    );
  });

  it('should create step span on onStepStart', async () => {
    await handler.onStart({
      model: testModel,
      system: undefined,
      prompt: 'test',
      messages: undefined,
      settings: testSettings,
      functionId: undefined,
      metadata: undefined,
    });

    await handler.onStepStart({
      stepNumber: 0,
      model: testModel,
      promptMessages: [
        { role: 'user', content: [{ type: 'text', text: 'test' }] },
      ],
      tools: undefined,
      toolChoice: undefined,
    });

    expect(tracer.spans).toHaveLength(2);
    expect(tracer.spans[1].name).toBe('ai.generateText.doGenerate');
    expect(tracer.spans[1].attributes['ai.model.provider']).toBe(
      'mock-provider',
    );
    expect(tracer.spans[1].attributes['ai.operationId']).toBe(
      'ai.generateText.doGenerate',
    );
    expect(tracer.spans[1].attributes['gen_ai.system']).toBe('mock-provider');
    expect(tracer.spans[1].attributes['gen_ai.request.model']).toBe(
      'mock-model-id',
    );
    expect(tracer.spans[1].attributes['ai.prompt.messages']).toBe(
      '[{"role":"user","content":[{"type":"text","text":"test"}]}]',
    );
  });

  it('should set response attributes on step span in onStepFinish', async () => {
    await handler.onStart({
      model: testModel,
      system: undefined,
      prompt: 'test',
      messages: undefined,
      settings: testSettings,
      functionId: undefined,
      metadata: undefined,
    });

    await handler.onStepStart({
      stepNumber: 0,
      model: testModel,
      promptMessages: [
        { role: 'user', content: [{ type: 'text', text: 'test' }] },
      ],
      tools: undefined,
      toolChoice: undefined,
    });

    await handler.onStepFinish({
      stepNumber: 0,
      finishReason: 'stop',
      text: 'Hello world',
      reasoningText: undefined,
      toolCalls: [],
      usage: testUsage,
      response: testResponse,
      providerMetadata: undefined,
    });

    const stepSpan = tracer.spans[1];
    expect(stepSpan.attributes['ai.response.finishReason']).toBe('stop');
    expect(stepSpan.attributes['ai.response.text']).toBe('Hello world');
    expect(stepSpan.attributes['ai.response.id']).toBe('resp-1');
    expect(stepSpan.attributes['ai.response.model']).toBe('mock-model-id');
    expect(stepSpan.attributes['ai.response.timestamp']).toBe(
      '1970-01-01T00:00:00.000Z',
    );
    expect(stepSpan.attributes['ai.usage.promptTokens']).toBe(10);
    expect(stepSpan.attributes['ai.usage.completionTokens']).toBe(20);
    expect(stepSpan.attributes['ai.usage.inputTokens']).toBe(10);
    expect(stepSpan.attributes['ai.usage.outputTokens']).toBe(20);
    expect(stepSpan.attributes['ai.usage.totalTokens']).toBe(30);
    expect(stepSpan.attributes['ai.usage.reasoningTokens']).toBe(5);
    expect(stepSpan.attributes['ai.usage.cachedInputTokens']).toBe(2);
    expect(stepSpan.attributes['gen_ai.response.finish_reasons']).toEqual([
      'stop',
    ]);
    expect(stepSpan.attributes['gen_ai.usage.input_tokens']).toBe(10);
    expect(stepSpan.attributes['gen_ai.usage.output_tokens']).toBe(20);
  });

  it('should set final attributes on root span in onFinish', async () => {
    await handler.onStart({
      model: testModel,
      system: undefined,
      prompt: 'test',
      messages: undefined,
      settings: testSettings,
      functionId: undefined,
      metadata: undefined,
    });

    await handler.onStepStart({
      stepNumber: 0,
      model: testModel,
      promptMessages: [
        { role: 'user', content: [{ type: 'text', text: 'test' }] },
      ],
      tools: undefined,
      toolChoice: undefined,
    });

    await handler.onStepFinish({
      stepNumber: 0,
      finishReason: 'stop',
      text: 'Hello world',
      reasoningText: undefined,
      toolCalls: [],
      usage: testUsage,
      response: testResponse,
      providerMetadata: undefined,
    });

    await handler.onFinish({
      finishReason: 'stop',
      text: 'Hello world',
      reasoningText: undefined,
      toolCalls: [],
      usage: testUsage,
      totalUsage: testUsage,
      response: testResponse,
      providerMetadata: undefined,
    });

    const rootSpan = tracer.spans[0];
    expect(rootSpan.attributes['ai.response.finishReason']).toBe('stop');
    expect(rootSpan.attributes['ai.response.text']).toBe('Hello world');
    expect(rootSpan.attributes['ai.usage.promptTokens']).toBe(10);
    expect(rootSpan.attributes['ai.usage.completionTokens']).toBe(20);
    expect(rootSpan.attributes['ai.usage.totalTokens']).toBe(30);
    expect(rootSpan.attributes['ai.usage.reasoningTokens']).toBe(5);
    expect(rootSpan.attributes['ai.usage.cachedInputTokens']).toBe(2);
  });

  it('should create tool call span on onToolCallStart', async () => {
    await handler.onStart({
      model: testModel,
      system: undefined,
      prompt: 'test',
      messages: undefined,
      settings: testSettings,
      functionId: undefined,
      metadata: undefined,
    });

    await handler.onStepStart({
      stepNumber: 0,
      model: testModel,
      promptMessages: [
        { role: 'user', content: [{ type: 'text', text: 'test' }] },
      ],
      tools: undefined,
      toolChoice: undefined,
    });

    await handler.onToolCallStart({
      toolName: 'weather',
      toolCallId: 'call-1',
      input: { city: 'Berlin' },
    });

    expect(tracer.spans).toHaveLength(3);
    const toolSpan = tracer.spans[2];
    expect(toolSpan.name).toBe('ai.toolCall');
    expect(toolSpan.attributes['ai.toolCall.name']).toBe('weather');
    expect(toolSpan.attributes['ai.toolCall.id']).toBe('call-1');
    expect(toolSpan.attributes['ai.toolCall.args']).toBe('{"city":"Berlin"}');
    expect(toolSpan.attributes['ai.operationId']).toBe('ai.toolCall');
  });

  it('should set result on tool call span in onToolCallFinish', async () => {
    await handler.onStart({
      model: testModel,
      system: undefined,
      prompt: 'test',
      messages: undefined,
      settings: testSettings,
      functionId: undefined,
      metadata: undefined,
    });

    await handler.onStepStart({
      stepNumber: 0,
      model: testModel,
      promptMessages: [
        { role: 'user', content: [{ type: 'text', text: 'test' }] },
      ],
      tools: undefined,
      toolChoice: undefined,
    });

    await handler.onToolCallStart({
      toolName: 'weather',
      toolCallId: 'call-1',
      input: { city: 'Berlin' },
    });

    await handler.onToolCallFinish({
      toolName: 'weather',
      toolCallId: 'call-1',
      input: { city: 'Berlin' },
      output: { temp: 20 },
      error: undefined,
      durationMs: 100,
    });

    const toolSpan = tracer.spans[2];
    expect(toolSpan.attributes['ai.toolCall.result']).toBe('{"temp":20}');
  });

  it('should record error on tool call span when tool fails', async () => {
    await handler.onStart({
      model: testModel,
      system: undefined,
      prompt: 'test',
      messages: undefined,
      settings: testSettings,
      functionId: undefined,
      metadata: undefined,
    });

    await handler.onStepStart({
      stepNumber: 0,
      model: testModel,
      promptMessages: [
        { role: 'user', content: [{ type: 'text', text: 'test' }] },
      ],
      tools: undefined,
      toolChoice: undefined,
    });

    await handler.onToolCallStart({
      toolName: 'weather',
      toolCallId: 'call-1',
      input: { city: 'Berlin' },
    });

    const error = new Error('API timeout');
    await handler.onToolCallFinish({
      toolName: 'weather',
      toolCallId: 'call-1',
      input: { city: 'Berlin' },
      output: undefined,
      error,
      durationMs: 5000,
    });

    const toolSpan = tracer.spans[2];
    expect(toolSpan.status).toEqual({
      code: 2,
      message: 'API timeout',
    });
    expect(toolSpan.events).toHaveLength(1);
    expect(toolSpan.events[0].name).toBe('exception');
  });

  it('should not record telemetry data when not enabled', async () => {
    const disabledHandler = createOtelHandler({
      telemetry: {
        isEnabled: false,
        tracer,
      },
    });

    await disabledHandler.onStart({
      model: testModel,
      system: undefined,
      prompt: 'test',
      messages: undefined,
      settings: testSettings,
      functionId: undefined,
      metadata: undefined,
    });

    expect(tracer.spans).toHaveLength(0);
  });

  it('should not record inputs when recordInputs is false', async () => {
    const noInputHandler = createOtelHandler({
      telemetry: {
        isEnabled: true,
        tracer,
        recordInputs: false,
      },
    });

    await noInputHandler.onStart({
      model: testModel,
      system: undefined,
      prompt: 'test',
      messages: undefined,
      settings: testSettings,
      functionId: undefined,
      metadata: undefined,
    });

    expect(tracer.spans[0].attributes['ai.prompt']).toBeUndefined();
    expect(tracer.spans[0].attributes['ai.model.provider']).toBe(
      'mock-provider',
    );
  });

  it('should not record outputs when recordOutputs is false', async () => {
    const noOutputHandler = createOtelHandler({
      telemetry: {
        isEnabled: true,
        tracer,
        recordOutputs: false,
      },
    });

    await noOutputHandler.onStart({
      model: testModel,
      system: undefined,
      prompt: 'test',
      messages: undefined,
      settings: testSettings,
      functionId: undefined,
      metadata: undefined,
    });

    await noOutputHandler.onStepStart({
      stepNumber: 0,
      model: testModel,
      promptMessages: [
        { role: 'user', content: [{ type: 'text', text: 'test' }] },
      ],
      tools: undefined,
      toolChoice: undefined,
    });

    await noOutputHandler.onStepFinish({
      stepNumber: 0,
      finishReason: 'stop',
      text: 'secret output',
      reasoningText: 'secret reasoning',
      toolCalls: [],
      usage: testUsage,
      response: testResponse,
      providerMetadata: undefined,
    });

    const stepSpan = tracer.spans[1];
    expect(stepSpan.attributes['ai.response.text']).toBeUndefined();
    expect(stepSpan.attributes['ai.response.reasoning']).toBeUndefined();
    expect(stepSpan.attributes['ai.response.finishReason']).toBe('stop');
  });

  it('should handle full lifecycle with tool calls', async () => {
    await handler.onStart({
      model: testModel,
      system: 'You are helpful.',
      prompt: 'What is the weather?',
      messages: undefined,
      settings: testSettings,
      functionId: undefined,
      metadata: undefined,
    });

    await handler.onStepStart({
      stepNumber: 0,
      model: testModel,
      promptMessages: [
        {
          role: 'user',
          content: [{ type: 'text', text: 'What is the weather?' }],
        },
      ],
      tools: { weather: { type: 'function' } },
      toolChoice: { type: 'auto' },
    });

    await handler.onToolCallStart({
      toolName: 'weather',
      toolCallId: 'call-1',
      input: { city: 'Berlin' },
    });

    await handler.onToolCallFinish({
      toolName: 'weather',
      toolCallId: 'call-1',
      input: { city: 'Berlin' },
      output: 'Sunny, 20°C',
      error: undefined,
      durationMs: 50,
    });

    await handler.onStepFinish({
      stepNumber: 0,
      finishReason: 'tool-calls',
      text: '',
      reasoningText: undefined,
      toolCalls: [
        {
          toolName: 'weather',
          toolCallId: 'call-1',
          input: { city: 'Berlin' },
        },
      ],
      usage: testUsage,
      response: testResponse,
      providerMetadata: undefined,
    });

    await handler.onStepStart({
      stepNumber: 1,
      model: testModel,
      promptMessages: [
        {
          role: 'user',
          content: [{ type: 'text', text: 'What is the weather?' }],
        },
      ],
      tools: undefined,
      toolChoice: undefined,
    });

    await handler.onStepFinish({
      stepNumber: 1,
      finishReason: 'stop',
      text: 'It is sunny in Berlin.',
      reasoningText: undefined,
      toolCalls: [],
      usage: testUsage,
      response: testResponse,
      providerMetadata: undefined,
    });

    await handler.onFinish({
      finishReason: 'stop',
      text: 'It is sunny in Berlin.',
      reasoningText: undefined,
      toolCalls: [],
      usage: testUsage,
      totalUsage: {
        ...testUsage,
        inputTokens: 20,
        outputTokens: 40,
        totalTokens: 60,
      },
      response: testResponse,
      providerMetadata: undefined,
    });

    expect(tracer.spans).toHaveLength(4);
    expect(tracer.spans.map(s => s.name)).toEqual([
      'ai.generateText',
      'ai.generateText.doGenerate',
      'ai.toolCall',
      'ai.generateText.doGenerate',
    ]);

    const rootSpan = tracer.spans[0];
    expect(rootSpan.attributes['ai.response.text']).toBe(
      'It is sunny in Berlin.',
    );
    expect(rootSpan.attributes['ai.usage.promptTokens']).toBe(20);
    expect(rootSpan.attributes['ai.usage.completionTokens']).toBe(40);

    const toolSpan = tracer.spans[2];
    expect(toolSpan.attributes['ai.toolCall.name']).toBe('weather');
    expect(toolSpan.attributes['ai.toolCall.result']).toBe('"Sunny, 20°C"');
  });

  it('should handle onStepFinish with tool calls in attributes', async () => {
    await handler.onStart({
      model: testModel,
      system: undefined,
      prompt: 'test',
      messages: undefined,
      settings: testSettings,
      functionId: undefined,
      metadata: undefined,
    });

    await handler.onStepStart({
      stepNumber: 0,
      model: testModel,
      promptMessages: [
        { role: 'user', content: [{ type: 'text', text: 'test' }] },
      ],
      tools: undefined,
      toolChoice: undefined,
    });

    await handler.onStepFinish({
      stepNumber: 0,
      finishReason: 'tool-calls',
      text: '',
      reasoningText: undefined,
      toolCalls: [
        {
          toolName: 'tool1',
          toolCallId: 'call-1',
          input: { value: 'test' },
        },
      ],
      usage: testUsage,
      response: testResponse,
      providerMetadata: undefined,
    });

    const stepSpan = tracer.spans[1];
    expect(stepSpan.attributes['ai.response.toolCalls']).toBe(
      JSON.stringify([
        { toolCallId: 'call-1', toolName: 'tool1', input: { value: 'test' } },
      ]),
    );
    expect(stepSpan.attributes['ai.response.finishReason']).toBe('tool-calls');
  });

  it('should propagate gen_ai request settings to step span', async () => {
    const handlerWithSettings = createOtelHandler({
      telemetry: { isEnabled: true, tracer },
    });

    await handlerWithSettings.onStart({
      model: testModel,
      system: undefined,
      prompt: 'test',
      messages: undefined,
      settings: {
        ...testSettings,
        temperature: 0.5,
        frequencyPenalty: 0.3,
        presencePenalty: 0.1,
        topP: 0.9,
        topK: 40,
        stopSequences: ['END'],
        seed: 42,
      },
      functionId: undefined,
      metadata: undefined,
    });

    await handlerWithSettings.onStepStart({
      stepNumber: 0,
      model: testModel,
      promptMessages: [
        { role: 'user', content: [{ type: 'text', text: 'test' }] },
      ],
      tools: undefined,
      toolChoice: undefined,
    });

    const stepSpan = tracer.spans[1];
    expect(stepSpan.attributes['gen_ai.request.temperature']).toBe(0.5);
    expect(stepSpan.attributes['gen_ai.request.frequency_penalty']).toBe(0.3);
    expect(stepSpan.attributes['gen_ai.request.presence_penalty']).toBe(0.1);
    expect(stepSpan.attributes['gen_ai.request.top_p']).toBe(0.9);
    expect(stepSpan.attributes['gen_ai.request.top_k']).toBe(40);
    expect(stepSpan.attributes['gen_ai.request.stop_sequences']).toEqual([
      'END',
    ]);
    expect(stepSpan.attributes['ai.settings.seed']).toBe(42);
  });
});
