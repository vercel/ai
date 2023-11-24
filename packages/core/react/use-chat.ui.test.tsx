import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockFetchDataStream, mockFetchError } from '../tests/utils/mock-fetch';
import { useChat } from './use-chat';

// mock nanoid import
jest.mock('nanoid', () => ({
  nanoid: () => Math.random().toString(36).slice(2, 9),
}));

const TestComponent = () => {
  const { messages, append, error, data } = useChat();

  return (
    <div>
      {error && <div data-testid="error">{error.toString()}</div>}
      {data && <div data-testid="data">{JSON.stringify(data)}</div>}
      {messages.map((m, idx) => (
        <div data-testid={`message-${idx}`} key={m.id}>
          {m.role === 'user' ? 'User: ' : 'AI: '}
          {m.content}
        </div>
      ))}
      <button
        data-testid="button"
        onClick={() => {
          append({ role: 'user', content: 'hi' });
        }}
      />
    </div>
  );
};

describe('useChat', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('Shows streamed complex text response', async () => {
    render(<TestComponent />);

    mockFetchDataStream(['0:"Hello"\n', '0:","\n', '0:" world"\n', '0:"."\n']);

    await userEvent.click(screen.getByTestId('button'));

    await screen.findByTestId('message-0');
    expect(screen.getByTestId('message-0')).toHaveTextContent('User: hi');

    await screen.findByTestId('message-1');
    expect(screen.getByTestId('message-1')).toHaveTextContent(
      'AI: Hello, world.',
    );
  });

  test('Shows streamed complex text response with data', async () => {
    render(<TestComponent />);

    mockFetchDataStream(['2:[{"t1":"v1"}]\n', '0:"Hello"\n']);

    await userEvent.click(screen.getByTestId('button'));

    await screen.findByTestId('data');
    expect(screen.getByTestId('data')).toHaveTextContent('[{"t1":"v1"}]');

    await screen.findByTestId('message-1');
    expect(screen.getByTestId('message-1')).toHaveTextContent('AI: Hello');
  });

  test('Shows error response', async () => {
    render(<TestComponent />);

    mockFetchError({ statusCode: 404, errorMessage: 'Not found' });

    await userEvent.click(screen.getByTestId('button'));

    // TODO bug? the user message does not show up
    // await screen.findByTestId('message-0');
    // expect(screen.getByTestId('message-0')).toHaveTextContent('User: hi');

    await screen.findByTestId('error');
    expect(screen.getByTestId('error')).toHaveTextContent('Error: Not found');
  });
});
