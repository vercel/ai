import { Message } from '@ai-sdk/ui-utils';
import { standardizePrompt } from './standardize-prompt';
import { CoreMessage } from './message';

it('should throw InvalidPromptError when system message has parts', () => {
  expect(() => {
    standardizePrompt({
      prompt: {
        messages: [
          {
            role: 'system',
            content: [{ type: 'text', text: 'test' }] as any,
          },
        ],
      },
      tools: undefined,
    });
  }).toThrowErrorMatchingSnapshot();
});

it('should throw InvalidPromptError when messages array is empty', () => {
  expect(() => {
    standardizePrompt({
      prompt: {
        messages: [],
      },
      tools: undefined,
    });
  }).toThrowErrorMatchingInlineSnapshot(
    `[AI_InvalidPromptError: Invalid prompt: messages must not be empty]`,
  );
});

it('should throw error for invalid inputs', () => {
  expect(() =>
    standardizePrompt({
      prompt: {
        messages: null as any,
      },
      tools: undefined,
    }),
  ).toThrowErrorMatchingInlineSnapshot(
    `[AI_InvalidPromptError: Invalid prompt: prompt or messages must be defined]`,
  );

  expect(() =>
    standardizePrompt({
      prompt: {
        messages: undefined as any,
      },
      tools: undefined,
    }),
  ).toThrowErrorMatchingInlineSnapshot(
    `[AI_InvalidPromptError: Invalid prompt: prompt or messages must be defined]`,
  );

  expect(() =>
    standardizePrompt({
      prompt: {
        messages: 'not an array' as any,
      },
      tools: undefined,
    }),
  ).toThrowErrorMatchingInlineSnapshot(`
    [AI_InvalidPromptError: Invalid prompt: messages must be an array of CoreMessage or UIMessage
    Received non-array value: "not an array"]
  `);

  expect(() =>
    standardizePrompt({
      prompt: {
        messages: [
          {
            role: 'system',
          },
        ] as any,
      },
      tools: undefined,
    }),
  ).toThrowErrorMatchingInlineSnapshot(`
    [AI_InvalidPromptError: Invalid prompt: messages must be an array of CoreMessage or UIMessage
    Received message of type: "other" at index 0
    messages[0]: {"role":"system"}]
  `);
});

it('should return empty array for empty arrays', () => {
  expect(() =>
    standardizePrompt({
      prompt: {
        messages: [],
      },
      tools: undefined,
    }),
  ).toThrowErrorMatchingInlineSnapshot(
    `[AI_InvalidPromptError: Invalid prompt: messages must not be empty]`,
  );
});

it('should filter UI messages with data role', () => {
  const messages: Omit<Message, 'id'>[] = [
    {
      role: 'data',
      content: 'some data',
    },
    {
      role: 'user',
      content: 'some user content',
    },
  ];

  expect(
    standardizePrompt({
      prompt: { messages },
      tools: undefined,
    }),
  ).toMatchInlineSnapshot(`
    {
      "messages": [
        {
          "content": "some user content",
          "role": "user",
        },
      ],
      "system": undefined,
      "type": "messages",
    }
  `);
});

it('should detect UI messages with toolInvocations', () => {
  const messages: Omit<Message, 'id'>[] = [
    {
      role: 'assistant',
      content: 'Hello',
      toolInvocations: [
        {
          state: 'result',
          toolCallId: '1',
          toolName: 'test',
          args: '{}',
          result: 'result',
        },
      ],
    },
  ];
  expect(
    standardizePrompt({
      prompt: { messages },
      tools: undefined,
    }),
  ).toMatchInlineSnapshot(`
    {
      "messages": [
        {
          "content": [
            {
              "text": "Hello",
              "type": "text",
            },
            {
              "args": "{}",
              "toolCallId": "1",
              "toolName": "test",
              "type": "tool-call",
            },
          ],
          "role": "assistant",
        },
        {
          "content": [
            {
              "result": "result",
              "toolCallId": "1",
              "toolName": "test",
              "type": "tool-result",
            },
          ],
          "role": "tool",
        },
      ],
      "system": undefined,
      "type": "messages",
    }
  `);
});

it('should detect UI messages with experimental_attachments', () => {
  const messages: Omit<Message, 'id'>[] = [
    {
      role: 'user',
      content: 'Check this file',
      experimental_attachments: [
        { contentType: 'image/png', url: 'https://test.com' },
      ],
    },
  ];

  expect(
    standardizePrompt({
      prompt: { messages },
      tools: undefined,
    }),
  ).toMatchInlineSnapshot(`
    {
      "messages": [
        {
          "content": [
            {
              "text": "Check this file",
              "type": "text",
            },
            {
              "image": "https://test.com/",
              "type": "image",
            },
          ],
          "role": "user",
        },
      ],
      "system": undefined,
      "type": "messages",
    }
  `);
});

it('should detect core messages with array content', () => {
  const messages: CoreMessage[] = [
    {
      role: 'user',
      content: [{ type: 'text', text: 'Hello' }],
    },
  ];
  expect(
    standardizePrompt({
      prompt: { messages },
      tools: undefined,
    }),
  ).toMatchInlineSnapshot(`
    {
      "messages": [
        {
          "content": [
            {
              "text": "Hello",
              "type": "text",
            },
          ],
          "role": "user",
        },
      ],
      "system": undefined,
      "type": "messages",
    }
  `);
});

it('should detect core messages with providerOptions', () => {
  const messages: CoreMessage[] = [
    {
      role: 'system',
      content: 'System prompt',
      providerOptions: { provider: { test: 'value' } },
    },
  ];
  expect(
    standardizePrompt({
      prompt: { messages },
      tools: undefined,
    }),
  ).toMatchInlineSnapshot(`
    {
      "messages": [
        {
          "content": "System prompt",
          "providerOptions": {
            "provider": {
              "test": "value",
            },
          },
          "role": "system",
        },
      ],
      "system": undefined,
      "type": "messages",
    }
  `);
});

it('should detect simple valid messages', () => {
  const messages: CoreMessage[] = [
    {
      role: 'system',
      content: 'You are a helpful assistant',
    },
    {
      role: 'user',
      content: 'Hello',
    },
    {
      role: 'assistant',
      content: 'Hi there!',
    },
  ];
  expect(
    standardizePrompt({
      prompt: { messages },
      tools: undefined,
    }),
  ).toMatchInlineSnapshot(`
    {
      "messages": [
        {
          "content": "You are a helpful assistant",
          "role": "system",
        },
        {
          "content": "Hello",
          "role": "user",
        },
        {
          "content": "Hi there!",
          "role": "assistant",
        },
      ],
      "system": undefined,
      "type": "messages",
    }
  `);
});

it('should detect mixed core messages and simple messages as valid messages', () => {
  const messages: any[] = [
    {
      role: 'system',
      content: 'System prompt',
      providerOptions: { provider: 'test' },
    },
    {
      role: 'user',
      content: 'Hello',
    },
  ];

  expect(() =>
    standardizePrompt({
      prompt: { messages },
      tools: undefined,
    }),
  ).toThrowErrorMatchingSnapshot();
});

it('should detect UI messages with parts array', () => {
  const messages: Omit<Message, 'id'>[] = [
    {
      role: 'assistant',
      content: 'Hello',
      parts: [{ type: 'text', text: 'Hello' }],
    },
  ];

  expect(
    standardizePrompt({
      prompt: { messages },
      tools: undefined,
    }),
  ).toMatchInlineSnapshot(`
    {
      "messages": [
        {
          "content": [
            {
              "text": "Hello",
              "type": "text",
            },
          ],
          "role": "assistant",
        },
      ],
      "system": undefined,
      "type": "messages",
    }
  `);
});
