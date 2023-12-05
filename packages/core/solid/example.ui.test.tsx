/** @jsxImportSource solid-js */
import { cleanup, render, screen } from '@solidjs/testing-library';
import '@testing-library/jest-dom';
import userEvent from '@testing-library/user-event';
import { For } from 'solid-js';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mockFetchDataStream } from '../tests/utils/mock-fetch';
import { useChat } from './use-chat';

const TestComponent = () => {
  const { messages, append } = useChat();

  return (
    <div>
      <For each={messages()}>
        {(m, idx) => (
          <div data-testid={`message-${idx()}`} class="whitespace-pre-wrap">
            {m.role === 'user' ? 'User: ' : 'AI: '}
            {m.content}
          </div>
        )}
      </For>

      <button
        data-testid="button"
        onClick={() => {
          append({ role: 'user', content: 'hi' });
        }}
      />
    </div>
  );
};

beforeEach(() => {
  render(() => <TestComponent />);
});

afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
});

it('should show messages for stream data response', async () => {
  mockFetchDataStream({
    url: 'https://example.com/api/chat',
    chunks: ['0:"Hello"\n', '0:","\n', '0:" world"\n', '0:"."\n'],
  });

  await userEvent.click(screen.getByTestId('button'));

  await screen.findByTestId('message-0');
  expect(screen.getByTestId('message-0')).toHaveTextContent('User: hi');

  await screen.findByTestId('message-1');
  expect(screen.getByTestId('message-1')).toHaveTextContent(
    'AI: Hello, world.',
  );
});
