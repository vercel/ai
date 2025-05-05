import { UIMessage } from '../types';
import { detectPromptType } from './detect-prompt-type';
import type { ModelMessage } from './message';

it('should return "other" for invalid inputs', () => {
  expect(detectPromptType(null as any)).toBe('other');
  expect(detectPromptType(undefined as any)).toBe('other');
  expect(detectPromptType('not an array' as any)).toBe('other');
});

it('should return "model-messages" for empty arrays', () => {
  expect(detectPromptType([])).toBe('model-messages');
});

it('should detect UI messages with file parts', () => {
  const messages: Omit<UIMessage, 'id'>[] = [
    {
      role: 'user',
      parts: [
        { type: 'file', mediaType: 'image/png', url: 'test.png' },
        { type: 'text', text: 'Check this file' },
      ],
    },
  ];
  expect(detectPromptType(messages)).toBe('ui-messages');
});

it('should detect model messages with array content', () => {
  const messages: ModelMessage[] = [
    {
      role: 'user',
      content: [{ type: 'text', text: 'Hello' }],
    },
  ];
  expect(detectPromptType(messages)).toBe('model-messages');
});

it('should detect model messages with providerOptions', () => {
  const messages: ModelMessage[] = [
    {
      role: 'system',
      content: 'System prompt',
      providerOptions: { provider: { test: 'value' } },
    },
  ];
  expect(detectPromptType(messages)).toBe('model-messages');
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
  expect(detectPromptType(messages)).toBe('model-messages');
});

it('should detect model messages', () => {
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
  expect(detectPromptType(messages)).toBe('model-messages');
});

it('should detect UI messages with parts array', () => {
  const messages: Omit<UIMessage, 'id'>[] = [
    {
      role: 'assistant',
      parts: [{ type: 'text', text: 'Hello' }],
    },
  ];
  expect(detectPromptType(messages)).toBe('ui-messages');
});
