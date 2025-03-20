import { Message } from '@ai-sdk/ui-utils';
import { detectPromptType } from './detect-prompt-type';
import type { CoreMessage } from './message';

it('should return "other" for invalid inputs', () => {
  expect(detectPromptType(null as any)).toBe('other');
  expect(detectPromptType(undefined as any)).toBe('other');
  expect(detectPromptType('not an array' as any)).toBe('other');
});

it('should return "messages" for empty arrays', () => {
  expect(detectPromptType([])).toBe('messages');
});

it('should detect UI messages with data role', () => {
  const messages: Omit<Message, 'id'>[] = [
    {
      role: 'data',
      content: 'some data',
    },
  ];
  expect(detectPromptType(messages)).toBe('ui-messages');
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
  expect(detectPromptType(messages)).toBe('ui-messages');
});

it('should detect UI messages with experimental_attachments', () => {
  const messages: Omit<Message, 'id'>[] = [
    {
      role: 'user',
      content: 'Check this file',
      experimental_attachments: [{ contentType: 'image/png', url: 'test.png' }],
    },
  ];
  expect(detectPromptType(messages)).toBe('ui-messages');
});

it('should detect core messages with array content', () => {
  const messages: CoreMessage[] = [
    {
      role: 'user',
      content: [{ type: 'text', text: 'Hello' }],
    },
  ];
  expect(detectPromptType(messages)).toBe('messages');
});

it('should detect core messages with providerOptions', () => {
  const messages: CoreMessage[] = [
    {
      role: 'system',
      content: 'System prompt',
      providerOptions: { provider: { test: 'value' } },
    },
  ];
  expect(detectPromptType(messages)).toBe('messages');
});

it('should detect simple valid messages', () => {
  const messages = [
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
  expect(detectPromptType(messages)).toBe('messages');
});

it('should detect mixed core messages and simple messages as valid messages', () => {
  const messages = [
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
  expect(detectPromptType(messages)).toBe('messages');
});

it('should detect UI messages with parts array', () => {
  const messages: Omit<Message, 'id'>[] = [
    {
      role: 'assistant',
      content: 'Hello',
      parts: [{ type: 'text', text: 'Hello' }],
    },
  ];
  expect(detectPromptType(messages)).toBe('ui-messages');
});
