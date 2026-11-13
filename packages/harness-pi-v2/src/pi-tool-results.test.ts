import { describe, expect, test } from 'vitest';
import {
  describeToolFailure,
  toAgentToolResult,
  toBuiltinToolValue,
  toRecordedAgentToolResult,
} from './pi-tool-results';

describe('toBuiltinToolValue', () => {
  test('records content, details and the error flag as JSON', () => {
    expect(
      toBuiltinToolValue({
        result: {
          content: [{ type: 'text', text: 'out' }],
          details: { truncation: undefined, lines: 2 },
          isError: true,
        },
      }),
    ).toEqual({
      raw: {
        content: [{ type: 'text', text: 'out' }],
        details: { lines: 2 },
        isError: true,
      },
    });
  });
});

describe('toAgentToolResult', () => {
  test('rebuilds a built-in tool result', () => {
    expect(
      toAgentToolResult({
        value: {
          raw: { content: [{ type: 'text', text: 'out' }], isError: true },
        },
        builtin: true,
      }),
    ).toEqual({
      content: [{ type: 'text', text: 'out' }],
      details: undefined,
      isError: true,
    });
  });

  test('uses the raw output of a host tool as text', () => {
    expect(
      toAgentToolResult({ value: { raw: { a: 1 } }, builtin: false }),
    ).toEqual({
      content: [{ type: 'text', text: '{"a":1}' }],
      details: undefined,
    });
    expect(
      toAgentToolResult({ value: { raw: 'plain' }, builtin: false }).content,
    ).toEqual([{ type: 'text', text: 'plain' }]);
  });

  test('uses the model output of a host tool', () => {
    expect(
      toAgentToolResult({
        value: {
          raw: null,
          modelOutput: {
            type: 'content',
            value: [
              { type: 'text', text: 'see image' },
              { type: 'image-data', data: 'AAAA', mediaType: 'image/png' },
            ],
          },
        },
        builtin: false,
      }),
    ).toEqual({
      content: [
        { type: 'text', text: 'see image' },
        { type: 'image', data: 'AAAA', mimeType: 'image/png' },
      ],
      details: undefined,
    });
    expect(
      toAgentToolResult({
        value: { raw: null, modelOutput: { type: 'error-text', value: 'bad' } },
        builtin: false,
      }),
    ).toEqual({
      content: [{ type: 'text', text: 'bad' }],
      details: undefined,
      isError: true,
    });
  });
});

describe('describeToolFailure', () => {
  test.each([
    [{ type: 'error', error: { message: 'boom' } }, 'boom'],
    [{ type: 'error', error: { message: '' } }, 'read failed with no message'],
    [
      { type: 'interrupted', retryable: false },
      'The read call was interrupted before it finished.',
    ],
    [
      { type: 'interrupted', retryable: false, partial: { raw: 'half' } },
      'The read call was interrupted before it finished.\nPartial output before the interruption:\n"half"',
    ],
    [{ type: 'denied', reason: 'not allowed' }, 'not allowed'],
    [
      { type: 'suspended', reason: 'client-tool' },
      'The read tool must be executed by the client, which is not supported.',
    ],
  ] as const)('describes %o', (output, text) => {
    expect(describeToolFailure({ output, toolName: 'read' })).toBe(text);
  });
});

describe('toRecordedAgentToolResult', () => {
  test('answers a failed call with an error result', () => {
    expect(
      toRecordedAgentToolResult({
        output: { type: 'error', error: { message: 'boom' } },
        toolName: 'read',
        builtin: true,
      }),
    ).toEqual({
      content: [{ type: 'text', text: 'boom' }],
      details: undefined,
      isError: true,
    });
  });
});
