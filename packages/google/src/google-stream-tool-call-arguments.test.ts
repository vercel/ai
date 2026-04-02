import { describe, it, expect } from 'vitest';
import {
  GoogleStreamToolCallArguments,
  StreamingFunctionCallPart,
} from './google-stream-tool-call-arguments';

function createHandler(providerOptionsName = 'google') {
  return new GoogleStreamToolCallArguments(
    () => 'test-id',
    providerOptionsName,
  );
}

describe('GoogleStreamToolCallArguments', () => {
  it('should return empty events for null parts', () => {
    const handler = createHandler();
    expect(handler.processStreamingFunctionCallParts(null)).toEqual({
      events: [],
      hasToolCalls: false,
    });
  });

  it('should return empty events for undefined parts', () => {
    const handler = createHandler();
    expect(handler.processStreamingFunctionCallParts(undefined)).toEqual({
      events: [],
      hasToolCalls: false,
    });
  });

  it('should skip non-functionCall parts', () => {
    const handler = createHandler();
    const result = handler.processStreamingFunctionCallParts([
      { text: 'hello' } as unknown as Record<string, unknown>,
    ]);
    expect(result).toEqual({ events: [], hasToolCalls: false });
  });

  it('should stream partial function call arguments across chunks', () => {
    const handler = createHandler();

    // Chunk 1: start of function call with name
    const r1 = handler.processStreamingFunctionCallParts([
      { functionCall: { name: 'get_weather', willContinue: true } },
    ]);

    expect(r1.hasToolCalls).toBe(false);
    expect(r1.events).toMatchInlineSnapshot(`
      [
        {
          "id": "test-id",
          "providerMetadata": undefined,
          "toolName": "get_weather",
          "type": "tool-input-start",
        },
      ]
    `);

    // Chunk 2: partial arg for location (willContinue string)
    const r2 = handler.processStreamingFunctionCallParts([
      {
        functionCall: {
          partialArgs: [
            {
              jsonPath: '$.location',
              stringValue: 'Boston',
              willContinue: true,
            },
          ],
          willContinue: true,
        },
      },
    ]);

    expect(r2.events).toMatchInlineSnapshot(`
      [
        {
          "delta": "{"location":"Boston",
          "id": "test-id",
          "providerMetadata": undefined,
          "type": "tool-input-delta",
        },
      ]
    `);

    // Chunk 3: continuation of location string
    const r3 = handler.processStreamingFunctionCallParts([
      {
        functionCall: {
          partialArgs: [{ jsonPath: '$.location', stringValue: ', MA' }],
          willContinue: true,
        },
      },
    ]);

    expect(r3.events).toMatchInlineSnapshot(`
      [
        {
          "delta": ", MA",
          "id": "test-id",
          "providerMetadata": undefined,
          "type": "tool-input-delta",
        },
      ]
    `);

    // Chunk 4: terminal empty functionCall
    const r4 = handler.processStreamingFunctionCallParts([
      { functionCall: {} } as StreamingFunctionCallPart,
    ]);

    expect(r4.hasToolCalls).toBe(true);
    expect(r4.events).toMatchInlineSnapshot(`
      [
        {
          "delta": ""}",
          "id": "test-id",
          "providerMetadata": undefined,
          "type": "tool-input-delta",
        },
        {
          "id": "test-id",
          "providerMetadata": undefined,
          "type": "tool-input-end",
        },
        {
          "input": "{"location":"Boston, MA"}",
          "providerMetadata": undefined,
          "toolCallId": "test-id",
          "toolName": "get_weather",
          "type": "tool-call",
        },
      ]
    `);
  });

  it('should stream parallel function calls with partial args', () => {
    const handler = createHandler();

    // First function call starts
    const r1 = handler.processStreamingFunctionCallParts([
      {
        functionCall: {
          name: 'get_weather',
          partialArgs: [{ jsonPath: '$.location', stringValue: 'Boston' }],
          willContinue: true,
        },
      },
    ]);

    expect(r1.events).toMatchInlineSnapshot(`
      [
        {
          "id": "test-id",
          "providerMetadata": undefined,
          "toolName": "get_weather",
          "type": "tool-input-start",
        },
        {
          "delta": "{"location":"Boston"",
          "id": "test-id",
          "providerMetadata": undefined,
          "type": "tool-input-delta",
        },
      ]
    `);

    // First function call terminates
    const r2 = handler.processStreamingFunctionCallParts([
      { functionCall: {} } as StreamingFunctionCallPart,
    ]);

    expect(r2.hasToolCalls).toBe(true);
    expect(r2.events).toMatchInlineSnapshot(`
      [
        {
          "delta": "}",
          "id": "test-id",
          "providerMetadata": undefined,
          "type": "tool-input-delta",
        },
        {
          "id": "test-id",
          "providerMetadata": undefined,
          "type": "tool-input-end",
        },
        {
          "input": "{"location":"Boston"}",
          "providerMetadata": undefined,
          "toolCallId": "test-id",
          "toolName": "get_weather",
          "type": "tool-call",
        },
      ]
    `);

    // Second function call starts
    const r3 = handler.processStreamingFunctionCallParts([
      {
        functionCall: {
          name: 'get_weather',
          partialArgs: [
            { jsonPath: '$.location', stringValue: 'San Francisco' },
          ],
          willContinue: true,
        },
      },
    ]);

    expect(r3.events).toMatchInlineSnapshot(`
      [
        {
          "id": "test-id",
          "providerMetadata": undefined,
          "toolName": "get_weather",
          "type": "tool-input-start",
        },
        {
          "delta": "{"location":"San Francisco"",
          "id": "test-id",
          "providerMetadata": undefined,
          "type": "tool-input-delta",
        },
      ]
    `);

    // Second function call terminates
    const r4 = handler.processStreamingFunctionCallParts([
      { functionCall: {} } as StreamingFunctionCallPart,
    ]);

    expect(r4.hasToolCalls).toBe(true);
    expect(r4.events).toMatchInlineSnapshot(`
      [
        {
          "delta": "}",
          "id": "test-id",
          "providerMetadata": undefined,
          "type": "tool-input-delta",
        },
        {
          "id": "test-id",
          "providerMetadata": undefined,
          "type": "tool-input-end",
        },
        {
          "input": "{"location":"San Francisco"}",
          "providerMetadata": undefined,
          "toolCallId": "test-id",
          "toolName": "get_weather",
          "type": "tool-call",
        },
      ]
    `);
  });

  it('should handle partial args with number and boolean values', () => {
    const handler = createHandler();

    // Start with name + number arg
    const r1 = handler.processStreamingFunctionCallParts([
      {
        functionCall: {
          name: 'control_light',
          partialArgs: [{ jsonPath: '$.brightness', numberValue: 50 }],
          willContinue: true,
        },
      },
    ]);

    expect(r1.events).toMatchInlineSnapshot(`
      [
        {
          "id": "test-id",
          "providerMetadata": undefined,
          "toolName": "control_light",
          "type": "tool-input-start",
        },
        {
          "delta": "{"brightness":50",
          "id": "test-id",
          "providerMetadata": undefined,
          "type": "tool-input-delta",
        },
      ]
    `);

    // Boolean arg
    const r2 = handler.processStreamingFunctionCallParts([
      {
        functionCall: {
          partialArgs: [{ jsonPath: '$.enabled', boolValue: true }],
          willContinue: true,
        },
      },
    ]);

    expect(r2.events).toMatchInlineSnapshot(`
      [
        {
          "delta": ","enabled":true",
          "id": "test-id",
          "providerMetadata": undefined,
          "type": "tool-input-delta",
        },
      ]
    `);

    // Terminal
    const r3 = handler.processStreamingFunctionCallParts([
      { functionCall: {} } as StreamingFunctionCallPart,
    ]);

    expect(r3.hasToolCalls).toBe(true);
    expect(r3.events).toMatchInlineSnapshot(`
      [
        {
          "delta": "}",
          "id": "test-id",
          "providerMetadata": undefined,
          "type": "tool-input-delta",
        },
        {
          "id": "test-id",
          "providerMetadata": undefined,
          "type": "tool-input-end",
        },
        {
          "input": "{"brightness":50,"enabled":true}",
          "providerMetadata": undefined,
          "toolCallId": "test-id",
          "toolName": "control_light",
          "type": "tool-call",
        },
      ]
    `);
  });

  it('should emit escaped tool input deltas for continued string partial args', () => {
    const handler = createHandler();

    // Start
    handler.processStreamingFunctionCallParts([
      { functionCall: { name: 'search_airport', willContinue: true } },
    ]);

    // First string chunk with special chars (willContinue)
    const r1 = handler.processStreamingFunctionCallParts([
      {
        functionCall: {
          partialArgs: [
            {
              jsonPath: '$.query',
              stringValue: 'Boston "Lo',
              willContinue: true,
            },
          ],
          willContinue: true,
        },
      },
    ]);

    expect(r1.events).toMatchInlineSnapshot(`
      [
        {
          "delta": "{"query":"Boston \\"Lo",
          "id": "test-id",
          "providerMetadata": undefined,
          "type": "tool-input-delta",
        },
      ]
    `);

    // Continuation with closing special chars
    const r2 = handler.processStreamingFunctionCallParts([
      {
        functionCall: {
          partialArgs: [{ jsonPath: '$.query', stringValue: 'gan"' }],
          willContinue: true,
        },
      },
    ]);

    expect(r2.events).toMatchInlineSnapshot(`
      [
        {
          "delta": "gan\\"",
          "id": "test-id",
          "providerMetadata": undefined,
          "type": "tool-input-delta",
        },
      ]
    `);

    // Terminal
    const r3 = handler.processStreamingFunctionCallParts([
      { functionCall: {} } as StreamingFunctionCallPart,
    ]);

    expect(r3.hasToolCalls).toBe(true);
    expect(r3.events).toMatchInlineSnapshot(`
      [
        {
          "delta": ""}",
          "id": "test-id",
          "providerMetadata": undefined,
          "type": "tool-input-delta",
        },
        {
          "id": "test-id",
          "providerMetadata": undefined,
          "type": "tool-input-end",
        },
        {
          "input": "{"query":"Boston \\"Logan\\""}",
          "providerMetadata": undefined,
          "toolCallId": "test-id",
          "toolName": "search_airport",
          "type": "tool-call",
        },
      ]
    `);
  });

  it('should accumulate null partial args alongside other primitive values', () => {
    const handler = createHandler();

    // Start with multiple args including null
    const r1 = handler.processStreamingFunctionCallParts([
      {
        functionCall: {
          name: 'set_preferences',
          partialArgs: [
            { jsonPath: '$.brightness', numberValue: 50 },
            { jsonPath: '$.enabled', boolValue: false },
            { jsonPath: '$.nickname', nullValue: {} },
          ],
          willContinue: true,
        },
      },
    ]);

    expect(r1.events).toMatchInlineSnapshot(`
      [
        {
          "id": "test-id",
          "providerMetadata": undefined,
          "toolName": "set_preferences",
          "type": "tool-input-start",
        },
        {
          "delta": "{"brightness":50,"enabled":false,"nickname":null",
          "id": "test-id",
          "providerMetadata": undefined,
          "type": "tool-input-delta",
        },
      ]
    `);

    // Terminal
    const r2 = handler.processStreamingFunctionCallParts([
      { functionCall: {} } as StreamingFunctionCallPart,
    ]);

    expect(r2.hasToolCalls).toBe(true);
    expect(r2.events).toMatchInlineSnapshot(`
      [
        {
          "delta": "}",
          "id": "test-id",
          "providerMetadata": undefined,
          "type": "tool-input-delta",
        },
        {
          "id": "test-id",
          "providerMetadata": undefined,
          "type": "tool-input-end",
        },
        {
          "input": "{"brightness":50,"enabled":false,"nickname":null}",
          "providerMetadata": undefined,
          "toolCallId": "test-id",
          "toolName": "set_preferences",
          "type": "tool-call",
        },
      ]
    `);
  });

  it('should include providerMetadata when thoughtSignature is present', () => {
    const handler = createHandler('vertex');

    const r1 = handler.processStreamingFunctionCallParts([
      {
        functionCall: { name: 'get_weather', willContinue: true },
        thoughtSignature: 'sig-abc',
      },
    ]);

    expect(r1.events).toMatchInlineSnapshot(`
      [
        {
          "id": "test-id",
          "providerMetadata": {
            "vertex": {
              "thoughtSignature": "sig-abc",
            },
          },
          "toolName": "get_weather",
          "type": "tool-input-start",
        },
      ]
    `);
  });
});
