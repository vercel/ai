import { describe, expect, test } from 'vitest';
import { createFxSseParser } from './fx-sse';
import { translateFxStreamPart } from './fx-stream-parts';
import type { FxModelStreamPart } from './fx-model-response';
import { readFixture } from './test-helpers';

async function readFixtureParts(name: string): Promise<FxModelStreamPart[]> {
  const parser = createFxSseParser();
  const body = await readFixture({ name });
  return [...parser.push(body), ...parser.flush()].flatMap(data => {
    try {
      return [JSON.parse(data) as FxModelStreamPart];
    } catch {
      return [];
    }
  });
}

describe('translateFxStreamPart', () => {
  test('translates reasoning and host tool calls', async () => {
    const parts = await readFixtureParts(
      'gateway-reasoning-tool-calls.sse.txt',
    );

    const translated = parts.flatMap(part =>
      translateFxStreamPart({ part, isBuiltinTool: () => false }),
    );

    expect(translated.map(part => part.type)).toMatchInlineSnapshot(`
      [
        "reasoning-start",
        "reasoning-end",
        "tool-input-start",
        "tool-input-delta",
        "tool-input-end",
        "tool-call",
        "tool-input-start",
        "tool-input-delta",
        "tool-input-end",
        "tool-call",
      ]
    `);
    expect(translated.filter(part => part.type === 'tool-call'))
      .toMatchInlineSnapshot(`
      [
        {
          "input": "{"city":"Paris"}",
          "toolCallId": "call-fbf0a350-5238-497e-97d2-fd4330a9d913-0",
          "toolName": "weather",
          "type": "tool-call",
        },
        {
          "input": "{"city":"Tokyo"}",
          "toolCallId": "call-fbf0a350-5238-497e-97d2-fd4330a9d913-1",
          "toolName": "weather",
          "type": "tool-call",
        },
      ]
    `);
  });

  test('marks built-in tool parts as provider-executed', async () => {
    const parts = await readFixtureParts('gateway-read-file-0.sse.txt');

    const translated = parts.flatMap(part =>
      translateFxStreamPart({
        part,
        isBuiltinTool: toolName => toolName === 'read_file',
      }),
    );

    expect(
      translated.filter(
        part => part.type === 'tool-input-start' || part.type === 'tool-call',
      ),
    ).toMatchInlineSnapshot(`
      [
        {
          "id": "toolu_01BEfCB8M29YcjDxsHPQxXER",
          "providerExecuted": true,
          "toolName": "read_file",
          "type": "tool-input-start",
        },
        {
          "input": "{"path": "notes.txt"}",
          "providerExecuted": true,
          "providerMetadata": {
            "anthropic": {
              "caller": {
                "type": "direct",
              },
            },
          },
          "toolCallId": "toolu_01BEfCB8M29YcjDxsHPQxXER",
          "toolName": "read_file",
          "type": "tool-call",
        },
      ]
    `);
  });

  test('translates an error part', () => {
    expect(
      translateFxStreamPart({
        part: { type: 'error', error: { message: 'overloaded' } },
        isBuiltinTool: () => false,
      }),
    ).toEqual([{ type: 'error', error: { message: 'overloaded' } }]);
  });
});
