import fs from 'node:fs';
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

function loadFixtureChunks(filename: string) {
  return fs
    .readFileSync(`src/__fixtures__/${filename}.chunks.txt`, 'utf8')
    .split('\n')
    .filter(line => line.trim().length > 0)
    .map(line => JSON.parse(line));
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

  it('should process real Vertex AI fixture with parallel getWeather calls', () => {
    const chunks = loadFixtureChunks('google-stream-tool-call-arguments');
    const handler = createHandler('vertex');

    const allEvents = [];
    let toolCallCount = 0;

    for (const chunk of chunks) {
      const parts = chunk.candidates?.[0]?.content?.parts;
      if (!parts) continue;

      const result = handler.processStreamingFunctionCallParts(parts);
      allEvents.push(...result.events);
      if (result.hasToolCalls) toolCallCount++;
    }

    expect(allEvents).toMatchInlineSnapshot(`
      [
        {
          "id": "test-id",
          "providerMetadata": {
            "vertex": {
              "thoughtSignature": "CiMBjz1rX25KieIB4d4AwFn8/WbsHTRNHBXso88PtemwfsSfRAp6AY89a1/e2FrmrE2HtlOxvV7vy8Kn5Og9n6CepcBKYW9aBT5QdXtTD4PGv9pDDWLEDAfsd86Et6k7HDEV976M3kC0ahLS8FCrwRntUKr+GF5uiUfPvgpzqNl5m8d8EwYykfwo1VwuTStR7q3mr/TzDcNzepafpVLdZloKYQGPPWtfkohmdau0GqGi3DuPbFTUBe5Ac/UbCvUk+P7KFbCGb93vFmnjmmTV7228DcAddqtWfe4iVePtSumw3JptYE6PIeVao2r8q7FXZKazzEiA9c04nmq6Vv9lOtt5NsgKrwEBjz1rX1ajIx3yeG/QI78uO+MsKoqgwrCI7PAEaDRqbyDCW/NX/4Vfuz1wp96oT3h/ttJ5ejzQyGamOrYreUUFvJBR/0TvFBdWOXwwCOWtvJ0Jh7SinV9HNqBDM1WWH8e+tGWY0r7xU/o/M1Fkwd73bvyp3BmSm5orrQL4jUZ1TN6ECqw7T7wHEkIfuBXGMZhQwAPzaapGVCdn0LjFJwd1aVReWmt6pE4ut993/K+0CqsBAY89a1+ts0Nggt7GZxVw/dQhH2Gc6KxRbAZKFMTuYRcNufJ5CyTvq85rMWEhTPWQxlQe1V7NIOlsQzyDhlejiCVbq0chDVrwRY23BmLrhSLi+SfKukEc0M+V9LdFiqxxLgUBrVdCvxA17g11j6HGdmXiNze2WDKm7ZXgMYvEiVmglpRZOb4JeJzxNPFsxhv2k6VkKB+GRtO48XwNz/i2taQ8Nq+LO5tED6HhCp4BAY89a18wBKoSkBT2IRo530FeNq/lpVozY0+k+p+H//TAtKoWZBamKCwra81idaMm1TTaWZGlX85Pq0kBvx1sQLFEhILeQrbH0O3Iuk9JlKLKctAwnBj8BZUGJEGtbigTKaSgWcMBhW+jfKWi1xwSxyJLRkIcXmE8U3FE/XHCLeiBy0NRa0yKn3xh62JU9087Q2nOMClxy5Zy5VsZ0qQ=",
            },
          },
          "toolName": "getWeather",
          "type": "tool-input-start",
        },
        {
          "delta": "{"location":"Boston",
          "id": "test-id",
          "providerMetadata": undefined,
          "type": "tool-input-delta",
        },
        {
          "delta": ""}",
          "id": "test-id",
          "providerMetadata": {
            "vertex": {
              "thoughtSignature": "CiMBjz1rX25KieIB4d4AwFn8/WbsHTRNHBXso88PtemwfsSfRAp6AY89a1/e2FrmrE2HtlOxvV7vy8Kn5Og9n6CepcBKYW9aBT5QdXtTD4PGv9pDDWLEDAfsd86Et6k7HDEV976M3kC0ahLS8FCrwRntUKr+GF5uiUfPvgpzqNl5m8d8EwYykfwo1VwuTStR7q3mr/TzDcNzepafpVLdZloKYQGPPWtfkohmdau0GqGi3DuPbFTUBe5Ac/UbCvUk+P7KFbCGb93vFmnjmmTV7228DcAddqtWfe4iVePtSumw3JptYE6PIeVao2r8q7FXZKazzEiA9c04nmq6Vv9lOtt5NsgKrwEBjz1rX1ajIx3yeG/QI78uO+MsKoqgwrCI7PAEaDRqbyDCW/NX/4Vfuz1wp96oT3h/ttJ5ejzQyGamOrYreUUFvJBR/0TvFBdWOXwwCOWtvJ0Jh7SinV9HNqBDM1WWH8e+tGWY0r7xU/o/M1Fkwd73bvyp3BmSm5orrQL4jUZ1TN6ECqw7T7wHEkIfuBXGMZhQwAPzaapGVCdn0LjFJwd1aVReWmt6pE4ut993/K+0CqsBAY89a1+ts0Nggt7GZxVw/dQhH2Gc6KxRbAZKFMTuYRcNufJ5CyTvq85rMWEhTPWQxlQe1V7NIOlsQzyDhlejiCVbq0chDVrwRY23BmLrhSLi+SfKukEc0M+V9LdFiqxxLgUBrVdCvxA17g11j6HGdmXiNze2WDKm7ZXgMYvEiVmglpRZOb4JeJzxNPFsxhv2k6VkKB+GRtO48XwNz/i2taQ8Nq+LO5tED6HhCp4BAY89a18wBKoSkBT2IRo530FeNq/lpVozY0+k+p+H//TAtKoWZBamKCwra81idaMm1TTaWZGlX85Pq0kBvx1sQLFEhILeQrbH0O3Iuk9JlKLKctAwnBj8BZUGJEGtbigTKaSgWcMBhW+jfKWi1xwSxyJLRkIcXmE8U3FE/XHCLeiBy0NRa0yKn3xh62JU9087Q2nOMClxy5Zy5VsZ0qQ=",
            },
          },
          "type": "tool-input-delta",
        },
        {
          "id": "test-id",
          "providerMetadata": {
            "vertex": {
              "thoughtSignature": "CiMBjz1rX25KieIB4d4AwFn8/WbsHTRNHBXso88PtemwfsSfRAp6AY89a1/e2FrmrE2HtlOxvV7vy8Kn5Og9n6CepcBKYW9aBT5QdXtTD4PGv9pDDWLEDAfsd86Et6k7HDEV976M3kC0ahLS8FCrwRntUKr+GF5uiUfPvgpzqNl5m8d8EwYykfwo1VwuTStR7q3mr/TzDcNzepafpVLdZloKYQGPPWtfkohmdau0GqGi3DuPbFTUBe5Ac/UbCvUk+P7KFbCGb93vFmnjmmTV7228DcAddqtWfe4iVePtSumw3JptYE6PIeVao2r8q7FXZKazzEiA9c04nmq6Vv9lOtt5NsgKrwEBjz1rX1ajIx3yeG/QI78uO+MsKoqgwrCI7PAEaDRqbyDCW/NX/4Vfuz1wp96oT3h/ttJ5ejzQyGamOrYreUUFvJBR/0TvFBdWOXwwCOWtvJ0Jh7SinV9HNqBDM1WWH8e+tGWY0r7xU/o/M1Fkwd73bvyp3BmSm5orrQL4jUZ1TN6ECqw7T7wHEkIfuBXGMZhQwAPzaapGVCdn0LjFJwd1aVReWmt6pE4ut993/K+0CqsBAY89a1+ts0Nggt7GZxVw/dQhH2Gc6KxRbAZKFMTuYRcNufJ5CyTvq85rMWEhTPWQxlQe1V7NIOlsQzyDhlejiCVbq0chDVrwRY23BmLrhSLi+SfKukEc0M+V9LdFiqxxLgUBrVdCvxA17g11j6HGdmXiNze2WDKm7ZXgMYvEiVmglpRZOb4JeJzxNPFsxhv2k6VkKB+GRtO48XwNz/i2taQ8Nq+LO5tED6HhCp4BAY89a18wBKoSkBT2IRo530FeNq/lpVozY0+k+p+H//TAtKoWZBamKCwra81idaMm1TTaWZGlX85Pq0kBvx1sQLFEhILeQrbH0O3Iuk9JlKLKctAwnBj8BZUGJEGtbigTKaSgWcMBhW+jfKWi1xwSxyJLRkIcXmE8U3FE/XHCLeiBy0NRa0yKn3xh62JU9087Q2nOMClxy5Zy5VsZ0qQ=",
            },
          },
          "type": "tool-input-end",
        },
        {
          "input": "{"location":"Boston"}",
          "providerMetadata": {
            "vertex": {
              "thoughtSignature": "CiMBjz1rX25KieIB4d4AwFn8/WbsHTRNHBXso88PtemwfsSfRAp6AY89a1/e2FrmrE2HtlOxvV7vy8Kn5Og9n6CepcBKYW9aBT5QdXtTD4PGv9pDDWLEDAfsd86Et6k7HDEV976M3kC0ahLS8FCrwRntUKr+GF5uiUfPvgpzqNl5m8d8EwYykfwo1VwuTStR7q3mr/TzDcNzepafpVLdZloKYQGPPWtfkohmdau0GqGi3DuPbFTUBe5Ac/UbCvUk+P7KFbCGb93vFmnjmmTV7228DcAddqtWfe4iVePtSumw3JptYE6PIeVao2r8q7FXZKazzEiA9c04nmq6Vv9lOtt5NsgKrwEBjz1rX1ajIx3yeG/QI78uO+MsKoqgwrCI7PAEaDRqbyDCW/NX/4Vfuz1wp96oT3h/ttJ5ejzQyGamOrYreUUFvJBR/0TvFBdWOXwwCOWtvJ0Jh7SinV9HNqBDM1WWH8e+tGWY0r7xU/o/M1Fkwd73bvyp3BmSm5orrQL4jUZ1TN6ECqw7T7wHEkIfuBXGMZhQwAPzaapGVCdn0LjFJwd1aVReWmt6pE4ut993/K+0CqsBAY89a1+ts0Nggt7GZxVw/dQhH2Gc6KxRbAZKFMTuYRcNufJ5CyTvq85rMWEhTPWQxlQe1V7NIOlsQzyDhlejiCVbq0chDVrwRY23BmLrhSLi+SfKukEc0M+V9LdFiqxxLgUBrVdCvxA17g11j6HGdmXiNze2WDKm7ZXgMYvEiVmglpRZOb4JeJzxNPFsxhv2k6VkKB+GRtO48XwNz/i2taQ8Nq+LO5tED6HhCp4BAY89a18wBKoSkBT2IRo530FeNq/lpVozY0+k+p+H//TAtKoWZBamKCwra81idaMm1TTaWZGlX85Pq0kBvx1sQLFEhILeQrbH0O3Iuk9JlKLKctAwnBj8BZUGJEGtbigTKaSgWcMBhW+jfKWi1xwSxyJLRkIcXmE8U3FE/XHCLeiBy0NRa0yKn3xh62JU9087Q2nOMClxy5Zy5VsZ0qQ=",
            },
          },
          "toolCallId": "test-id",
          "toolName": "getWeather",
          "type": "tool-call",
        },
        {
          "id": "test-id",
          "providerMetadata": undefined,
          "toolName": "getWeather",
          "type": "tool-input-start",
        },
        {
          "delta": "{"location":"San Francisco",
          "id": "test-id",
          "providerMetadata": undefined,
          "type": "tool-input-delta",
        },
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
          "input": "{"location":"San Francisco"}",
          "providerMetadata": undefined,
          "toolCallId": "test-id",
          "toolName": "getWeather",
          "type": "tool-call",
        },
      ]
    `);

    expect(toolCallCount).toBe(2);
  });
});
