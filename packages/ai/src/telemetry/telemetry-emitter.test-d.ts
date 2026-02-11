import { describe, expectTypeOf, it } from 'vitest';
import { TelemetryEmitter } from './telemetry-emitter';
import type {
  TelemetryHandler,
  OperationStartedEvent,
  OperationUpdatedEvent,
  GenerateTextStartData,
  DoGenerateStartData,
  ToolCallStartData,
  GenerateTextResultData,
  DoGenerateResultData,
  ToolCallResultData,
  StartDataMap,
  ResultDataMap,
} from './types';

const validGenerateTextStartData: GenerateTextStartData = {
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

const validDoGenerateStartData: DoGenerateStartData = {
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
  prompt: { messages: [], tools: undefined, toolChoice: undefined },
};

const validToolCallStartData: ToolCallStartData = {
  toolCall: { name: 'search', id: 'tc-1', args: { query: 'test' } },
};

const validGenerateTextResultData: GenerateTextResultData = {
  response: { finishReason: 'stop', text: 'Hello!' },
  usage: { inputTokens: 10, outputTokens: 5 },
};

const validDoGenerateResultData: DoGenerateResultData = {
  response: {
    id: 'resp-1',
    model: 'gpt-4o',
    timestamp: '2024-01-01T00:00:00Z',
    finishReason: 'stop',
    text: 'Hello!',
  },
  usage: { inputTokens: 10, outputTokens: 5 },
};

const validToolCallResultData: ToolCallResultData = {
  toolCall: { name: 'search', id: 'tc-1', result: { items: [] } },
};

describe('TelemetryEmitter type safety', () => {
  describe('startOperation', () => {
    it('should accept correct data type for ai.generateText', () => {
      const handler: TelemetryHandler = {};
      const emitter = new TelemetryEmitter({ handler });

      // This should compile without errors
      emitter.startOperation({
        operationId: 'test',
        operationName: 'ai.generateText',
        data: validGenerateTextStartData,
      });
    });

    it('should accept correct data type for ai.generateText.doGenerate', () => {
      const handler: TelemetryHandler = {};
      const emitter = new TelemetryEmitter({ handler });

      emitter.startOperation({
        operationId: 'test',
        operationName: 'ai.generateText.doGenerate',
        data: validDoGenerateStartData,
      });
    });

    it('should accept correct data type for ai.toolCall', () => {
      const handler: TelemetryHandler = {};
      const emitter = new TelemetryEmitter({ handler });

      emitter.startOperation({
        operationId: 'test',
        operationName: 'ai.toolCall',
        data: validToolCallStartData,
      });
    });

    it('should reject wrong data type for ai.generateText', () => {
      const handler: TelemetryHandler = {};
      const emitter = new TelemetryEmitter({ handler });

      emitter.startOperation({
        operationId: 'test',
        operationName: 'ai.generateText',
        // @ts-expect-error - ToolCallStartData is not valid for ai.generateText
        data: validToolCallStartData,
      });
    });

    it('should reject wrong data type for ai.toolCall', () => {
      const handler: TelemetryHandler = {};
      const emitter = new TelemetryEmitter({ handler });

      emitter.startOperation({
        operationId: 'test',
        operationName: 'ai.toolCall',
        // @ts-expect-error - GenerateTextStartData is not valid for ai.toolCall
        data: validGenerateTextStartData,
      });
    });

    it('should reject missing required fields', () => {
      const handler: TelemetryHandler = {};
      const emitter = new TelemetryEmitter({ handler });

      emitter.startOperation({
        operationId: 'test',
        operationName: 'ai.generateText',
        // @ts-expect-error - missing 'model' field
        data: {
          settings: validGenerateTextStartData.settings,
          headers: {},
          prompt: { raw: 'test' },
        },
      });
    });
  });

  describe('updateOperation', () => {
    it('should accept correct data type for ai.generateText result', () => {
      const handler: TelemetryHandler = {};
      const emitter = new TelemetryEmitter({ handler });

      emitter.updateOperation({
        operationId: 'test',
        operationName: 'ai.generateText',
        data: validGenerateTextResultData,
      });
    });

    it('should accept correct data type for ai.generateText.doGenerate result', () => {
      const handler: TelemetryHandler = {};
      const emitter = new TelemetryEmitter({ handler });

      emitter.updateOperation({
        operationId: 'test',
        operationName: 'ai.generateText.doGenerate',
        data: validDoGenerateResultData,
      });
    });

    it('should accept correct data type for ai.toolCall result', () => {
      const handler: TelemetryHandler = {};
      const emitter = new TelemetryEmitter({ handler });

      emitter.updateOperation({
        operationId: 'test',
        operationName: 'ai.toolCall',
        data: validToolCallResultData,
      });
    });

    it('should reject wrong data type for ai.toolCall result', () => {
      const handler: TelemetryHandler = {};
      const emitter = new TelemetryEmitter({ handler });

      emitter.updateOperation({
        operationId: 'test',
        operationName: 'ai.toolCall',
        // @ts-expect-error - GenerateTextResultData is not valid for ai.toolCall
        data: validGenerateTextResultData,
      });
    });
  });

  describe('StartDataMap and ResultDataMap', () => {
    it('should correctly map operation names to start data types', () => {
      expectTypeOf<
        StartDataMap['ai.generateText']
      >().toEqualTypeOf<GenerateTextStartData>();
      expectTypeOf<
        StartDataMap['ai.generateText.doGenerate']
      >().toEqualTypeOf<DoGenerateStartData>();
      expectTypeOf<
        StartDataMap['ai.toolCall']
      >().toEqualTypeOf<ToolCallStartData>();
    });

    it('should correctly map operation names to result data types', () => {
      expectTypeOf<
        ResultDataMap['ai.generateText']
      >().toEqualTypeOf<GenerateTextResultData>();
      expectTypeOf<
        ResultDataMap['ai.generateText.doGenerate']
      >().toEqualTypeOf<DoGenerateResultData>();
      expectTypeOf<
        ResultDataMap['ai.toolCall']
      >().toEqualTypeOf<ToolCallResultData>();
    });
  });

  describe('OperationStartedEvent discrimination', () => {
    it('should allow switching on operationName for known operations', () => {
      const handler: TelemetryHandler = {
        onOperationStarted(event: OperationStartedEvent) {
          if (event.operationName === 'ai.generateText') {
            const _model = event.data.model;
            expectTypeOf(_model).not.toBeUndefined();
          }

          if (event.operationName === 'ai.toolCall') {
            const _toolCall = event.data.toolCall;
            expectTypeOf(_toolCall).not.toBeUndefined();
          }
        },
      };

      expectTypeOf(handler).toMatchTypeOf<TelemetryHandler>();
    });
  });

  describe('OperationUpdatedEvent discrimination', () => {
    it('should allow switching on operationName for known operations', () => {
      const handler: TelemetryHandler = {
        onOperationUpdated(event: OperationUpdatedEvent) {
          if (event.operationName === 'ai.generateText') {
            const _response = event.data.response;
            expectTypeOf(_response).not.toBeUndefined();
          }

          if (event.operationName === 'ai.toolCall') {
            const _toolCall = event.data.toolCall;
            expectTypeOf(_toolCall).not.toBeUndefined();
          }
        },
      };

      expectTypeOf(handler).toMatchTypeOf<TelemetryHandler>();
    });
  });
});
