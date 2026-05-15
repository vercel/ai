import { describe, expect, it } from 'vitest';
import { convertToOpenAIChatMessages } from './convert-to-openai-chat-messages';

describe('convertToOpenAIChatMessages — reasoning round-trip', () => {
  it('drops reasoning parts by default and emits a warning', () => {
    const { messages, warnings } = convertToOpenAIChatMessages({
      prompt: [
        {
          role: 'assistant',
          content: [
            { type: 'reasoning', text: 'Let me think about this...' },
            { type: 'text', text: 'The answer is 42.' },
          ],
        },
      ],
    });

    expect(messages).toEqual([
      { role: 'assistant', content: 'The answer is 42.' },
    ]);
    // No reasoning_content field — current behavior preserved for OpenAI
    expect(messages[0]).not.toHaveProperty('reasoning_content');
    // But the drop is now visible (was silent before this PR)
    expect(warnings).toEqual([
      expect.objectContaining({
        type: 'other',
        message: expect.stringContaining('reasoning parts were dropped'),
      }),
    ]);
  });

  it('does not emit a warning when no reasoning parts are present', () => {
    const { messages, warnings } = convertToOpenAIChatMessages({
      prompt: [
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'Hello' }],
        },
      ],
    });

    expect(messages).toEqual([{ role: 'assistant', content: 'Hello' }]);
    expect(warnings).toEqual([]);
  });

  it('does not emit a warning when includeReasoningContent is true even if no reasoning parts are present', () => {
    const { warnings } = convertToOpenAIChatMessages({
      includeReasoningContent: true,
      prompt: [
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'Hello' }],
        },
      ],
    });

    expect(warnings).toEqual([]);
  });

  it('serializes reasoning parts as reasoning_content when includeReasoningContent is true', () => {
    const { messages, warnings } = convertToOpenAIChatMessages({
      includeReasoningContent: true,
      prompt: [
        {
          role: 'assistant',
          content: [
            { type: 'reasoning', text: 'Step 1: parse input.' },
            { type: 'reasoning', text: ' Step 2: produce output.' },
            { type: 'text', text: 'Done.' },
          ],
        },
      ],
    });

    expect(messages).toEqual([
      {
        role: 'assistant',
        content: 'Done.',
        reasoning_content: 'Step 1: parse input. Step 2: produce output.',
      },
    ]);
    expect(warnings).toEqual([]);
  });

  it('omits reasoning_content when no reasoning parts are present (even with the flag on)', () => {
    const { messages } = convertToOpenAIChatMessages({
      includeReasoningContent: true,
      prompt: [
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'Plain answer.' }],
        },
      ],
    });

    expect(messages).toEqual([{ role: 'assistant', content: 'Plain answer.' }]);
    expect(messages[0]).not.toHaveProperty('reasoning_content');
  });

  it('round-trips reasoning_content across a tool-use turn (the DeepSeek failure case)', () => {
    // This mirrors the canonical pattern from the AI SDK tool-calling
    // docs. The user asks something, the model responds with both
    // `reasoning` and `tool-call` parts, the caller invokes the tool,
    // then constructs a follow-up `messages` array that includes the
    // assistant turn from `result.response.messages`. Without this PR,
    // the second `convertToOpenAIChatMessages` invocation drops the
    // reasoning parts and DeepSeek rejects the request.
    const { messages, warnings } = convertToOpenAIChatMessages({
      includeReasoningContent: true,
      prompt: [
        { role: 'user', content: [{ type: 'text', text: 'What is 2+2?' }] },
        {
          role: 'assistant',
          content: [
            { type: 'reasoning', text: '2+2 is a basic arithmetic op.' },
            {
              type: 'tool-call',
              toolCallId: 'call_1',
              toolName: 'calculator',
              input: { expr: '2+2' },
            },
          ],
        },
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: 'call_1',
              toolName: 'calculator',
              output: { type: 'json', value: { result: 4 } },
            },
          ],
        },
      ],
    });

    expect(messages).toMatchObject([
      { role: 'user', content: 'What is 2+2?' },
      {
        role: 'assistant',
        // Note: upstream v4 emits `null` (not `''`) when toolCalls fire
        // and the text-channel is empty. The original v3 draft expected
        // `''`; updated here for v4 compatibility. The PR's core
        // contribution — `reasoning_content` round-trip — is unaffected.
        content: null,
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: { name: 'calculator', arguments: '{"expr":"2+2"}' },
          },
        ],
        // <-- Without this PR, this property is absent and DeepSeek
        //     rejects with "The reasoning_content in the thinking
        //     mode must be passed back to the API."
        reasoning_content: '2+2 is a basic arithmetic op.',
      },
      {
        role: 'tool',
        tool_call_id: 'call_1',
        content: '{"result":4}',
      },
    ]);
    expect(warnings).toEqual([]);
  });
});
