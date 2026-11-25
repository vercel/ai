import { describe, expect, it } from 'vitest';
import { loadWeatherApprovalFixture } from './__fixtures__/weather-approval-fixture';
import { mergeObservedToolCall } from './merge-observed-tool-call';

function capturedCall() {
  const event = loadWeatherApprovalFixture({ harness: 'github-copilot' })[0];
  if (event.type !== 'update' || event.value.sessionUpdate !== 'tool_call')
    throw new Error('Missing captured tool call.');
  return mergeObservedToolCall({ previous: undefined, update: event.value });
}

describe('mergeObservedToolCall', () => {
  it('retains omitted fields and changes only supplied fields', () => {
    const previous = capturedCall();
    expect(
      mergeObservedToolCall({
        previous,
        update: { toolCallId: previous.toolCallId, status: 'in_progress' },
      }),
    ).toMatchInlineSnapshot(`
      {
        "kind": "read",
        "rawInput": {
          "city": "Austin",
        },
        "status": "in_progress",
        "title": "ai-sdk-harness-tools-get_weather",
        "toolCallId": "call_Hiiu3DojfZiulcj6OujlcpEq",
      }
    `);
  });

  it('retains null names and titles but clears other explicit null fields', () => {
    const previous = {
      ...capturedCall(),
      name: 'mcp__ai-sdk-harness-tools__get_weather',
      content: [],
      locations: [],
      rawOutput: { temperature: 72 },
      _meta: { serverName: 'ai-sdk-harness-tools' },
    };
    expect(
      mergeObservedToolCall({
        previous,
        update: {
          toolCallId: previous.toolCallId,
          name: null,
          title: null,
          kind: null,
          status: null,
          content: null,
          locations: null,
          rawInput: null,
          rawOutput: null,
          _meta: null,
        },
      }),
    ).toMatchInlineSnapshot(`
      {
        "_meta": null,
        "content": undefined,
        "kind": undefined,
        "locations": undefined,
        "name": "mcp__ai-sdk-harness-tools__get_weather",
        "rawInput": null,
        "rawOutput": null,
        "status": undefined,
        "title": "ai-sdk-harness-tools-get_weather",
        "toolCallId": "call_Hiiu3DojfZiulcj6OujlcpEq",
      }
    `);
  });

  it('replaces raw input rather than merging object properties', () => {
    const previous = capturedCall();
    expect(
      mergeObservedToolCall({
        previous,
        update: { toolCallId: previous.toolCallId, rawInput: {} },
      }).rawInput,
    ).toMatchInlineSnapshot(`{}`);
  });

  it('initializes a sparse observation with a fallback title', () => {
    expect(
      mergeObservedToolCall({
        previous: undefined,
        update: { toolCallId: 'sparse', name: null, title: null },
      }),
    ).toMatchInlineSnapshot(`
      {
        "title": "Tool sparse",
        "toolCallId": "sparse",
      }
    `);
  });
});
