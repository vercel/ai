import { describe, expect, test } from 'vitest';
import { describeToolFailure, toFxToolResult } from './fx-tool-results';

describe('toFxToolResult', () => {
  test('returns the text of a built-in tool output', () => {
    expect(
      toFxToolResult({
        output: { type: 'result', value: { raw: { text: 'file contents' } } },
        toolName: 'read_file',
        builtin: true,
      }),
    ).toBe('file contents');
  });

  test('returns a typed result for a built-in output with images or an error', () => {
    expect(
      toFxToolResult({
        output: {
          type: 'result',
          value: {
            raw: {
              text: 'image attached',
              images: [{ mediaType: 'image/png', data: 'iVBORw==' }],
            },
          },
        },
        toolName: 'read_file',
        builtin: true,
      }),
    ).toMatchInlineSnapshot(`
      {
        "images": [
          {
            "data": "iVBORw==",
            "mimeType": "image/png",
            "type": "image",
          },
        ],
        "text": "image attached",
        "type": "libfx.tool-result",
      }
    `);
    expect(
      toFxToolResult({
        output: {
          type: 'result',
          value: { raw: { text: 'not found', isError: true } },
        },
        toolName: 'read_file',
        builtin: true,
      }),
    ).toMatchInlineSnapshot(`
      {
        "images": [],
        "isError": true,
        "text": "not found",
        "type": "libfx.tool-result",
      }
    `);
  });

  test('returns the raw value of a host tool, or its model output', () => {
    expect(
      toFxToolResult({
        output: { type: 'result', value: { raw: { forecast: 'sunny' } } },
        toolName: 'weather',
        builtin: false,
      }),
    ).toEqual({ forecast: 'sunny' });
    expect(
      toFxToolResult({
        output: {
          type: 'result',
          value: {
            raw: { forecast: 'sunny' },
            modelOutput: { type: 'text', value: 'It is sunny.' },
          },
        },
        toolName: 'weather',
        builtin: false,
      }),
    ).toMatchInlineSnapshot(`
      {
        "images": [],
        "text": "It is sunny.",
        "type": "libfx.tool-result",
      }
    `);
  });

  test('returns an error result for other outcomes and a missing outcome', () => {
    expect(
      toFxToolResult({
        output: { type: 'denied', reason: 'Not allowed.' },
        toolName: 'weather',
        builtin: false,
      }),
    ).toMatchInlineSnapshot(`
      {
        "images": [],
        "isError": true,
        "text": "Not allowed.",
        "type": "libfx.tool-result",
      }
    `);
    expect(
      toFxToolResult({
        output: undefined,
        toolName: 'weather',
        builtin: false,
      }),
    ).toMatchInlineSnapshot(`
      {
        "images": [],
        "isError": true,
        "text": "The weather call has no recorded result.",
        "type": "libfx.tool-result",
      }
    `);
  });
});

describe('describeToolFailure', () => {
  test('describes an interruption with partial output', () => {
    expect(
      describeToolFailure({
        output: {
          type: 'interrupted',
          retryable: false,
          partial: { raw: { stdout: 'partial' } },
        },
        toolName: 'shell',
      }),
    ).toMatchInlineSnapshot(`
      "The shell call was interrupted before it finished.
      Partial output before the interruption:
      {"stdout":"partial"}"
    `);
  });
});
