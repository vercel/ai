import { createGoogle } from '@ai-sdk/google';
import { generateText, jsonSchema, streamText } from '..';
import { describe, expect, it } from 'vitest';

// Synthetic protocol cases; every request is handled by the local fetch below.
const signature = 'b3BhcXVlLXN5bnRoZXRpYy1zaWduYXR1cmUvKz0=';
const callSignature = 'Y2FsbC1zaWduYXR1cmU=';
const args = { query: 'example', options: { limit: 0, enabled: false } };
const call = {
  functionCall: { id: 'call-1', name: 'lookup', args },
  thoughtSignature: callSignature,
};
const noArgsCall = { functionCall: { id: 'call-2', name: 'read_theme' } };
const a = { text: 'A' };
const b = { text: 'B' };
const r1 = { text: 'R1', thought: true };
const r2 = { text: 'R2', thought: true };
const signedText = { text: '', thoughtSignature: signature };
const signedReasoning = {
  text: '',
  thought: true,
  thoughtSignature: signature,
};
const text = (value: string, sig?: string) => ({
  type: 'text',
  text: value,
  signature: sig,
});
const reasoning = (value: string, sig?: string) => ({
  type: 'reasoning',
  text: value,
  signature: sig,
});
const lookup = {
  type: 'tool-call',
  id: 'call-1',
  name: 'lookup',
  input: args,
  signature: callSignature,
};
const readTheme = {
  type: 'tool-call',
  id: 'call-2',
  name: 'read_theme',
  input: {},
  signature: undefined,
};
const cases = [
  {
    name: 'signed empty text after completed call',
    groups: [[a, call, signedText]],
    expected: [text('A'), lookup, text('', signature)],
    wire: [a, call, signedText],
  },
  {
    name: 'separate events and no-args call',
    groups: [[a], [noArgsCall], [signedText], [b]],
    expected: [text('A'), readTheme, text('', signature), text('B')],
    wire: [a, noArgsCall, signedText, b],
  },
  {
    name: 'signed empty reasoning after completed call',
    groups: [[a, noArgsCall, signedReasoning, b]],
    expected: [text('A'), readTheme, reasoning('', signature), text('B')],
    wire: [a, noArgsCall, signedReasoning, b],
  },
  {
    name: 'empty text between reasoning parts',
    groups: [[r1], [signedText], [r2]],
    expected: [reasoning('R1'), text('', signature), reasoning('R2')],
    wire: [r1, signedText, r2],
  },
  {
    name: 'empty reasoning between reasoning parts',
    groups: [[r1, signedReasoning, r2]],
    expected: [reasoning('R1'), reasoning('', signature), reasoning('R2')],
    wire: [r1, signedReasoning, r2],
  },
  {
    name: 'text-only trailing signature normalization',
    groups: [[a], [signedText]],
    expected: [text('A', signature)],
    wire: [{ text: 'A', thoughtSignature: signature }],
  },
  {
    name: 'unsigned empty text remains removed',
    groups: [[a, noArgsCall, { text: '' }, b]],
    expected: [text('A'), readTheme, text('B')],
    wire: [a, noArgsCall, b],
  },
];

type ObservedPart = {
  type: string;
  text?: string;
  toolCallId?: string;
  toolName?: string;
  input?: unknown;
  providerMetadata?: Record<string, Record<string, unknown>>;
  providerOptions?: Record<string, Record<string, unknown>>;
};

function summarize(part: ObservedPart) {
  const metadata = part.providerMetadata ?? part.providerOptions;
  const sig = (metadata?.google ?? metadata?.vertex ?? metadata?.googleVertex)
    ?.thoughtSignature;
  return part.type === 'tool-call'
    ? {
        type: part.type,
        id: part.toolCallId,
        name: part.toolName,
        input: part.input,
        signature: sig,
      }
    : { type: part.type, text: part.text, signature: sig };
}

describe('public Google signed-empty stream round trip', () => {
  it.each(cases)('$name', async ({ groups, expected, wire }) => {
    const requests: Array<{
      contents: Array<{ role: string; parts: unknown[] }>;
    }> = [];
    const sse = groups
      .map(
        (parts, index) =>
          `data: ${JSON.stringify({ candidates: [{ content: { role: 'model', parts }, index: 0, ...(index === groups.length - 1 ? { finishReason: 'STOP' } : {}) }] })}\n\n`,
      )
      .join('');
    const localFetch: typeof fetch = async (_url, init) => {
      requests.push(JSON.parse(init?.body as string));
      return requests.length === 1
        ? new Response(sse, {
            headers: { 'content-type': 'text/event-stream' },
          })
        : Response.json({
            candidates: [
              {
                content: { role: 'model', parts: [{ text: 'Done' }] },
                finishReason: 'STOP',
                index: 0,
              },
            ],
          });
    };
    const settings = { apiKey: 'dummy-key', fetch: localFetch };
    const model = createGoogle(settings)('gemini-2.5-flash');
    const tools = {
      lookup: {
        inputSchema: jsonSchema<typeof args>({
          type: 'object',
          properties: {
            query: { type: 'string' },
            options: {
              type: 'object',
              properties: {
                limit: { type: 'number' },
                enabled: { type: 'boolean' },
              },
              required: ['limit', 'enabled'],
            },
          },
          required: ['query', 'options'],
        }),
      },
      read_theme: {
        inputSchema: jsonSchema<Record<string, never>>({
          type: 'object',
          properties: {},
        }),
      },
    };
    const result = streamText({
      model,
      prompt: 'Synthetic preservation check',
      tools,
    });
    const events = [];
    for await (const event of result.stream) {
      events.push(event);
      expect(event.type).not.toBe('error');
    }
    const step = await result.finalStep;
    expect(step.content.map(summarize)).toEqual(expected);
    const assistant = step.response.messages.find(
      message => message.role === 'assistant',
    );
    expect(assistant).toBeDefined();
    if (assistant == null || typeof assistant.content === 'string') {
      throw new Error('Expected structured assistant content');
    }
    expect(assistant.content.map(summarize)).toEqual(expected);
    const signedEvents = events.filter(
      event =>
        'providerMetadata' in event &&
        (
          event.providerMetadata?.google ??
          event.providerMetadata?.vertex ??
          event.providerMetadata?.googleVertex
        )?.thoughtSignature === signature,
    );
    if (expected.some(part => part.signature === signature)) {
      expect(signedEvents.length).toBeGreaterThan(0);
      const expectedType = expected.find(
        part => part.signature === signature,
      )?.type;
      expect(
        signedEvents.every(event => event.type.startsWith(`${expectedType}-`)),
      ).toBe(true);
    }

    await generateText({
      model,
      tools,
      messages: [
        { role: 'user', content: 'Synthetic preservation check' },
        ...step.response.messages,
        ...(step.toolCalls.length === 0
          ? []
          : [
              {
                role: 'tool' as const,
                content: step.toolCalls.map(toolCall => ({
                  type: 'tool-result' as const,
                  toolCallId: toolCall.toolCallId,
                  toolName: toolCall.toolName,
                  output: { type: 'json' as const, value: { done: true } },
                })),
              },
            ]),
        { role: 'user', content: 'Continue' },
      ],
    });
    expect(requests).toHaveLength(2);
    const expectedWire = wire.map(part => {
      if (!('functionCall' in part) || part.functionCall == null) return part;
      const { id, ...functionCall } = part.functionCall;
      return {
        ...part,
        functionCall: {
          id,
          ...functionCall,
          args: 'args' in part.functionCall ? part.functionCall.args : {},
        },
      };
    });
    expect(
      requests[1].contents.find(content => content.role === 'model')?.parts,
    ).toEqual(expectedWire);
    expect(requests[1].contents.at(-1)).toEqual({
      role: 'user',
      parts: [{ text: 'Continue' }],
    });
  });
});
