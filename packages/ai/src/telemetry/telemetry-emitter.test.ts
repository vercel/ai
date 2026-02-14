import { describe, it, expect, vi } from 'vitest';
import { TelemetryEmitter } from './telemetry-emitter';
import type {
  TelemetryHandler,
  GenerateTextStartData,
  DoGenerateStartData,
  ToolCallStartData,
  GenerateTextResultData,
  DoGenerateResultData,
  ToolCallResultData,
  InjectedFields,
} from './types';

function createGenerateTextStartData(): GenerateTextStartData {
  return {
    model: { provider: 'openai', id: 'gpt-4o' },
    settings: {
      maxRetries: 2,
      maxOutputTokens: 100,
      temperature: 0.7,
      topP: undefined,
      topK: undefined,
      frequencyPenalty: undefined,
      presencePenalty: undefined,
      stopSequences: undefined,
      seed: undefined,
    },
    headers: { 'x-custom': 'value' },
    prompt: { raw: { prompt: 'Hello' } },
  };
}

function createDoGenerateStartData(): DoGenerateStartData {
  return {
    model: { provider: 'openai', id: 'gpt-4o' },
    settings: {
      maxRetries: 2,
      maxOutputTokens: 100,
      temperature: 0.7,
      topP: undefined,
      topK: undefined,
      frequencyPenalty: undefined,
      presencePenalty: undefined,
      stopSequences: undefined,
      seed: undefined,
    },
    headers: {},
    prompt: {
      messages: [{ role: 'user', content: 'Hello' }],
      tools: undefined,
      toolChoice: undefined,
    },
  };
}

function createToolCallStartData(): ToolCallStartData {
  return {
    toolCall: { name: 'search', id: 'tc-1', args: { query: 'test' } },
  };
}

function createGenerateTextResultData(): GenerateTextResultData {
  return {
    response: { finishReason: 'stop', text: 'Hello!' },
    usage: { inputTokens: 10, outputTokens: 5 },
  };
}

function createDoGenerateResultData(): DoGenerateResultData {
  return {
    response: {
      id: 'resp-1',
      model: 'gpt-4o',
      timestamp: '2024-01-01T00:00:00Z',
      finishReason: 'stop',
      text: 'Hello!',
    },
    usage: { inputTokens: 10, outputTokens: 5 },
  };
}

function createToolCallResultData(): ToolCallResultData {
  return {
    toolCall: { name: 'search', id: 'tc-1', result: { items: [] } },
  };
}

describe('TelemetryEmitter', () => {
  describe('constructor', () => {
    it('should be inactive when no config is provided', () => {
      const emitter = new TelemetryEmitter(undefined);
      expect(emitter.isActive).toBe(false);
    });

    it('should be active when config is provided', () => {
      const handler: TelemetryHandler = {};
      const emitter = new TelemetryEmitter({ handler });
      expect(emitter.isActive).toBe(true);
    });
  });

  describe('startOperation', () => {
    it('should emit correctly typed ai.generateText start event', () => {
      const onOperationStarted = vi.fn();
      const handler: TelemetryHandler = { onOperationStarted };
      const emitter = new TelemetryEmitter({ handler });

      const data = createGenerateTextStartData();
      emitter.startOperation({
        operationId: 'test-123',
        operationName: 'ai.generateText',
        data,
      });

      expect(onOperationStarted).toHaveBeenCalledTimes(1);
      const event = onOperationStarted.mock.calls[0][0];

      expect(event.type).toBe('operationStarted');
      expect(event.operationId).toBe('test-123');
      expect(event.operationName).toBe('ai.generateText');
      expect(event.parentOperationId).toBeUndefined();
      expect(typeof event.startTime).toBe('number');

      // Access data fields - cast to expected type for runtime tests
      const eventData = event.data as GenerateTextStartData & InjectedFields;
      expect(eventData.model).toEqual({ provider: 'openai', id: 'gpt-4o' });
      expect(eventData.settings).toMatchObject({ maxRetries: 2 });
      expect(eventData.prompt).toEqual({ raw: { prompt: 'Hello' } });
    });

    it('should emit correctly typed ai.generateText.doGenerate start event', () => {
      const onOperationStarted = vi.fn();
      const handler: TelemetryHandler = { onOperationStarted };
      const emitter = new TelemetryEmitter({ handler });

      const data = createDoGenerateStartData();
      emitter.startOperation({
        operationId: 'test-456',
        operationName: 'ai.generateText.doGenerate',
        parentOperationId: 'test-123',
        data,
      });

      expect(onOperationStarted).toHaveBeenCalledTimes(1);
      const event = onOperationStarted.mock.calls[0][0];

      expect(event.operationName).toBe('ai.generateText.doGenerate');
      expect(event.parentOperationId).toBe('test-123');

      const eventData = event.data as DoGenerateStartData & InjectedFields;
      expect(eventData.prompt).toHaveProperty('messages');
    });

    it('should emit correctly typed ai.toolCall start event', () => {
      const onOperationStarted = vi.fn();
      const handler: TelemetryHandler = { onOperationStarted };
      const emitter = new TelemetryEmitter({ handler });

      const data = createToolCallStartData();
      emitter.startOperation({
        operationId: 'tc-test',
        operationName: 'ai.toolCall',
        parentOperationId: 'test-123',
        data,
      });

      expect(onOperationStarted).toHaveBeenCalledTimes(1);
      const event = onOperationStarted.mock.calls[0][0];

      expect(event.operationName).toBe('ai.toolCall');

      const eventData = event.data as ToolCallStartData & InjectedFields;
      expect(eventData.toolCall).toEqual({
        name: 'search',
        id: 'tc-1',
        args: { query: 'test' },
      });
    });

    it('should not emit when inactive', () => {
      const onOperationStarted = vi.fn();
      const emitter = new TelemetryEmitter(undefined);

      emitter.startOperation({
        operationId: 'test',
        operationName: 'ai.generateText',
        data: createGenerateTextStartData(),
      });

      expect(onOperationStarted).not.toHaveBeenCalled();
    });

    it('should inject functionId into event data', () => {
      const onOperationStarted = vi.fn();
      const handler: TelemetryHandler = { onOperationStarted };
      const emitter = new TelemetryEmitter({
        handler,
        functionId: 'my-function',
      });

      emitter.startOperation({
        operationId: 'test',
        operationName: 'ai.generateText',
        data: createGenerateTextStartData(),
      });

      const event = onOperationStarted.mock.calls[0][0];
      const eventData = event.data as GenerateTextStartData & InjectedFields;
      expect(eventData.functionId).toBe('my-function');
    });

    it('should inject metadata into event data', () => {
      const onOperationStarted = vi.fn();
      const handler: TelemetryHandler = { onOperationStarted };
      const emitter = new TelemetryEmitter({
        handler,
        metadata: { env: 'test', version: 1 },
      });

      emitter.startOperation({
        operationId: 'test',
        operationName: 'ai.generateText',
        data: createGenerateTextStartData(),
      });

      const event = onOperationStarted.mock.calls[0][0];
      const eventData = event.data as GenerateTextStartData & InjectedFields;
      expect(eventData.metadata).toEqual({ env: 'test', version: 1 });
    });

    it('should use config parentOperationId when not explicitly provided', () => {
      const onOperationStarted = vi.fn();
      const handler: TelemetryHandler = { onOperationStarted };
      const emitter = new TelemetryEmitter({
        handler,
        parentOperationId: 'trace-123',
      });

      emitter.startOperation({
        operationId: 'test',
        operationName: 'ai.generateText',
        data: createGenerateTextStartData(),
      });

      const event = onOperationStarted.mock.calls[0][0];
      expect(event.parentOperationId).toBe('trace-123');
    });

    it('should prefer explicit parentOperationId over config', () => {
      const onOperationStarted = vi.fn();
      const handler: TelemetryHandler = { onOperationStarted };
      const emitter = new TelemetryEmitter({
        handler,
        parentOperationId: 'trace-123',
      });

      emitter.startOperation({
        operationId: 'test',
        operationName: 'ai.generateText',
        parentOperationId: 'explicit-parent',
        data: createGenerateTextStartData(),
      });

      const event = onOperationStarted.mock.calls[0][0];
      expect(event.parentOperationId).toBe('explicit-parent');
    });
  });

  describe('updateOperation', () => {
    it('should emit correctly typed ai.generateText update event', () => {
      const onOperationUpdated = vi.fn();
      const handler: TelemetryHandler = { onOperationUpdated };
      const emitter = new TelemetryEmitter({ handler });

      const data = createGenerateTextResultData();
      emitter.updateOperation({
        operationId: 'test-123',
        operationName: 'ai.generateText',
        data,
      });

      expect(onOperationUpdated).toHaveBeenCalledTimes(1);
      const event = onOperationUpdated.mock.calls[0][0];

      expect(event.type).toBe('operationUpdated');
      expect(event.operationId).toBe('test-123');
      expect(event.operationName).toBe('ai.generateText');

      const eventData = event.data as GenerateTextResultData;
      expect(eventData.response).toMatchObject({ finishReason: 'stop' });
      expect(eventData.usage).toEqual({ inputTokens: 10, outputTokens: 5 });
    });

    it('should emit correctly typed ai.generateText.doGenerate update event', () => {
      const onOperationUpdated = vi.fn();
      const handler: TelemetryHandler = { onOperationUpdated };
      const emitter = new TelemetryEmitter({ handler });

      const data = createDoGenerateResultData();
      emitter.updateOperation({
        operationId: 'test-456',
        operationName: 'ai.generateText.doGenerate',
        data,
      });

      expect(onOperationUpdated).toHaveBeenCalledTimes(1);
      const event = onOperationUpdated.mock.calls[0][0];

      expect(event.operationName).toBe('ai.generateText.doGenerate');

      const eventData = event.data as DoGenerateResultData;
      expect(eventData.response).toMatchObject({
        id: 'resp-1',
        model: 'gpt-4o',
        finishReason: 'stop',
      });
    });

    it('should emit correctly typed ai.toolCall update event', () => {
      const onOperationUpdated = vi.fn();
      const handler: TelemetryHandler = { onOperationUpdated };
      const emitter = new TelemetryEmitter({ handler });

      const data = createToolCallResultData();
      emitter.updateOperation({
        operationId: 'tc-test',
        operationName: 'ai.toolCall',
        data,
      });

      expect(onOperationUpdated).toHaveBeenCalledTimes(1);
      const event = onOperationUpdated.mock.calls[0][0];

      expect(event.operationName).toBe('ai.toolCall');

      const eventData = event.data as ToolCallResultData;
      expect(eventData.toolCall).toEqual({
        name: 'search',
        id: 'tc-1',
        result: { items: [] },
      });
    });

    it('should not emit when inactive', () => {
      const onOperationUpdated = vi.fn();
      const emitter = new TelemetryEmitter(undefined);

      emitter.updateOperation({
        operationId: 'test',
        operationName: 'ai.generateText',
        data: createGenerateTextResultData(),
      });

      expect(onOperationUpdated).not.toHaveBeenCalled();
    });
  });

  describe('endOperation', () => {
    it('should emit operation ended event', () => {
      const onOperationEnded = vi.fn();
      const handler: TelemetryHandler = { onOperationEnded };
      const emitter = new TelemetryEmitter({ handler });

      emitter.endOperation({
        operationId: 'test-123',
        operationName: 'ai.generateText',
      });

      expect(onOperationEnded).toHaveBeenCalledTimes(1);
      const event = onOperationEnded.mock.calls[0][0];

      expect(event.type).toBe('operationEnded');
      expect(event.operationId).toBe('test-123');
      expect(event.operationName).toBe('ai.generateText');
      expect(typeof event.endTime).toBe('number');
      expect(event.data).toEqual({});
    });

    it('should not emit when inactive', () => {
      const onOperationEnded = vi.fn();
      const emitter = new TelemetryEmitter(undefined);

      emitter.endOperation({
        operationId: 'test',
        operationName: 'ai.generateText',
      });

      expect(onOperationEnded).not.toHaveBeenCalled();
    });
  });

  describe('errorOperation', () => {
    it('should emit operation error event for Error instances', () => {
      const onOperationError = vi.fn();
      const handler: TelemetryHandler = { onOperationError };
      const emitter = new TelemetryEmitter({ handler });

      const error = new Error('Test error');
      error.stack = 'Error: Test error\n    at test.ts:1:1';

      emitter.errorOperation({
        operationId: 'test-123',
        operationName: 'ai.generateText',
        error,
      });

      expect(onOperationError).toHaveBeenCalledTimes(1);
      const event = onOperationError.mock.calls[0][0];

      expect(event.type).toBe('operationError');
      expect(event.operationId).toBe('test-123');
      expect(event.operationName).toBe('ai.generateText');
      expect(event.error.name).toBe('Error');
      expect(event.error.message).toBe('Test error');
      expect(event.error.stack).toBe('Error: Test error\n    at test.ts:1:1');
    });

    it('should handle non-Error exceptions', () => {
      const onOperationError = vi.fn();
      const handler: TelemetryHandler = { onOperationError };
      const emitter = new TelemetryEmitter({ handler });

      emitter.errorOperation({
        operationId: 'test-123',
        operationName: 'ai.generateText',
        error: 'string error',
      });

      const event = onOperationError.mock.calls[0][0];
      expect(event.error.name).toBe('UnknownError');
      expect(event.error.message).toBe('string error');
    });

    it('should not emit when inactive', () => {
      const onOperationError = vi.fn();
      const emitter = new TelemetryEmitter(undefined);

      emitter.errorOperation({
        operationId: 'test',
        operationName: 'ai.generateText',
        error: new Error('test'),
      });

      expect(onOperationError).not.toHaveBeenCalled();
    });
  });

  describe('data policy (recordInputs/recordOutputs)', () => {
    it('should strip prompt content when recordInputs is false', () => {
      const onOperationStarted = vi.fn();
      const handler: TelemetryHandler = { onOperationStarted };
      const emitter = new TelemetryEmitter({ handler, recordInputs: false });

      emitter.startOperation({
        operationId: 'test',
        operationName: 'ai.generateText',
        data: createGenerateTextStartData(),
      });

      const event = onOperationStarted.mock.calls[0][0];
      const eventData = event.data as GenerateTextStartData & InjectedFields;
      expect(eventData.prompt.raw).toBeUndefined();
    });

    it('should strip tool args when recordInputs is false', () => {
      const onOperationStarted = vi.fn();
      const handler: TelemetryHandler = { onOperationStarted };
      const emitter = new TelemetryEmitter({ handler, recordInputs: false });

      emitter.startOperation({
        operationId: 'test',
        operationName: 'ai.toolCall',
        data: createToolCallStartData(),
      });

      const event = onOperationStarted.mock.calls[0][0];
      const eventData = event.data as ToolCallStartData & InjectedFields;
      expect(eventData.toolCall.args).toBeUndefined();
      expect(eventData.toolCall.name).toBe('search'); // name preserved
      expect(eventData.toolCall.id).toBe('tc-1'); // id preserved
    });

    it('should preserve messages marker when recordInputs is false', () => {
      const onOperationStarted = vi.fn();
      const handler: TelemetryHandler = { onOperationStarted };
      const emitter = new TelemetryEmitter({ handler, recordInputs: false });

      emitter.startOperation({
        operationId: 'test',
        operationName: 'ai.generateText.doGenerate',
        data: createDoGenerateStartData(),
      });

      const event = onOperationStarted.mock.calls[0][0];
      const eventData = event.data as DoGenerateStartData & InjectedFields;
      // Messages should be empty array (marker preserved) not undefined
      expect(eventData.prompt.messages).toEqual([]);
      expect(eventData.prompt.tools).toBeUndefined();
      expect(eventData.prompt.toolChoice).toBeUndefined();
    });

    it('should strip response content when recordOutputs is false', () => {
      const onOperationUpdated = vi.fn();
      const handler: TelemetryHandler = { onOperationUpdated };
      const emitter = new TelemetryEmitter({ handler, recordOutputs: false });

      emitter.updateOperation({
        operationId: 'test',
        operationName: 'ai.generateText.doGenerate',
        data: createDoGenerateResultData(),
      });

      const event = onOperationUpdated.mock.calls[0][0];
      const eventData = event.data as DoGenerateResultData;
      expect(eventData.response.text).toBeUndefined();
      expect(eventData.response.toolCalls).toBeUndefined();
      expect(eventData.response.providerMetadata).toBeUndefined();
      // Metadata preserved
      expect(eventData.response.finishReason).toBe('stop');
      expect(eventData.response.id).toBe('resp-1');
      expect(eventData.response.model).toBe('gpt-4o');
    });

    it('should strip tool result when recordOutputs is false', () => {
      const onOperationUpdated = vi.fn();
      const handler: TelemetryHandler = { onOperationUpdated };
      const emitter = new TelemetryEmitter({ handler, recordOutputs: false });

      emitter.updateOperation({
        operationId: 'test',
        operationName: 'ai.toolCall',
        data: createToolCallResultData(),
      });

      const event = onOperationUpdated.mock.calls[0][0];
      const eventData = event.data as ToolCallResultData;
      expect(eventData.toolCall.result).toBeUndefined();
      expect(eventData.toolCall.name).toBe('search'); // name preserved
      expect(eventData.toolCall.id).toBe('tc-1'); // id preserved
    });

    it('should preserve all data when recordInputs and recordOutputs are true (default)', () => {
      const onOperationStarted = vi.fn();
      const onOperationUpdated = vi.fn();
      const handler: TelemetryHandler = {
        onOperationStarted,
        onOperationUpdated,
      };
      const emitter = new TelemetryEmitter({ handler });

      emitter.startOperation({
        operationId: 'test',
        operationName: 'ai.toolCall',
        data: createToolCallStartData(),
      });

      emitter.updateOperation({
        operationId: 'test',
        operationName: 'ai.toolCall',
        data: createToolCallResultData(),
      });

      const startEvent = onOperationStarted.mock.calls[0][0];
      const startData = startEvent.data as ToolCallStartData & InjectedFields;
      expect(startData.toolCall.args).toEqual({ query: 'test' });

      const updateEvent = onOperationUpdated.mock.calls[0][0];
      const updateData = updateEvent.data as ToolCallResultData;
      expect(updateData.toolCall.result).toEqual({ items: [] });
    });
  });

  describe('handler discrimination', () => {
    it('should allow handlers to switch on operationName', () => {
      const startedOperations: string[] = [];
      const updatedOperations: string[] = [];

      const handler: TelemetryHandler = {
        onOperationStarted(event) {
          switch (event.operationName) {
            case 'ai.generateText':
              startedOperations.push('generateText');
              break;
            case 'ai.generateText.doGenerate':
              startedOperations.push('doGenerate');
              break;
            case 'ai.toolCall':
              startedOperations.push('toolCall');
              break;
          }
        },
        onOperationUpdated(event) {
          switch (event.operationName) {
            case 'ai.generateText':
              updatedOperations.push('generateText');
              break;
            case 'ai.generateText.doGenerate':
              updatedOperations.push('doGenerate');
              break;
            case 'ai.toolCall':
              updatedOperations.push('toolCall');
              break;
          }
        },
      };

      const emitter = new TelemetryEmitter({ handler });

      emitter.startOperation({
        operationId: '1',
        operationName: 'ai.generateText',
        data: createGenerateTextStartData(),
      });
      emitter.startOperation({
        operationId: '2',
        operationName: 'ai.toolCall',
        data: createToolCallStartData(),
      });
      emitter.updateOperation({
        operationId: '1',
        operationName: 'ai.generateText',
        data: createGenerateTextResultData(),
      });
      emitter.updateOperation({
        operationId: '2',
        operationName: 'ai.toolCall',
        data: createToolCallResultData(),
      });

      expect(startedOperations).toEqual(['generateText', 'toolCall']);
      expect(updatedOperations).toEqual(['generateText', 'toolCall']);
    });
  });
});
