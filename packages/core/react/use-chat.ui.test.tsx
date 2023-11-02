import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockFetch } from '../tests/utils/mock-fetch';
import { useChat } from './use-chat';

describe('useChat', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  const TestComponent = () => {
    const { messages, append } = useChat();

    return (
      <div>
        {messages.length > 0
          ? messages.map((m, idx) => (
              <div data-testid={`message-${idx}`} key={m.id}>
                {m.role === 'user' ? 'User: ' : 'AI: '}
                {m.content}
              </div>
            ))
          : null}
        <button
          onClick={() => {
            append({ role: 'user', content: 'hello ai' });
          }}
        >
          Start chat
        </button>
      </div>
    );
  };

  test('Shows streamed complex text response', async () => {
    render(<TestComponent />);

    mockFetch(['0:"Hello"\n', '0:","\n', '0:" world"\n', '0:"."\n']);

    userEvent.click(screen.getByText('Start chat'));

    await screen.findByTestId('message-1');

    expect(screen.getByTestId('message-0')).toHaveTextContent('hello ai');
    expect(screen.getByTestId('message-1')).toHaveTextContent('Hello, world.');
  });
});
