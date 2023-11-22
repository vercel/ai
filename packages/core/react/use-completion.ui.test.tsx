import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  mockFetchDataStream,
  mockFetchTextStream,
} from '../tests/utils/mock-fetch';
import { useCompletion } from './use-completion';

// mock nanoid import
jest.mock('nanoid', () => ({
  nanoid: () => Math.random().toString(36).slice(2, 9),
}));

const TestComponent = () => {
  const { completion, handleSubmit, error, handleInputChange, input } =
    useCompletion();

  return (
    <div>
      {error && <div data-testid="error">{error.toString()}</div>}
      {completion && <div data-testid="completion">{completion}</div>}
      <form onSubmit={handleSubmit}>
        <input
          data-testid="input"
          value={input}
          placeholder="Say something..."
          onChange={handleInputChange}
        />
      </form>
    </div>
  );
};

describe('useCompletion', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('Shows streamed complex normal response', async () => {
    render(<TestComponent />);

    mockFetchTextStream({
      url: 'https://example.com/api/completion',
      chunks: ['Hello', ',', ' world', '.'],
    });

    await userEvent.type(screen.getByTestId('input'), 'hi{enter}');

    await screen.findByTestId('completion');
    expect(screen.getByTestId('completion')).toHaveTextContent('Hello, world.');
  });

  test('Shows streamed complex text response', async () => {
    render(<TestComponent />);

    mockFetchDataStream({
      url: 'https://example.com/api/completion',
      chunks: ['0:"Hello"\n', '0:","\n', '0:" world"\n', '0:"."\n'],
    });

    await userEvent.type(screen.getByTestId('input'), 'hi{enter}');

    await screen.findByTestId('completion');
    expect(screen.getByTestId('completion')).toHaveTextContent('Hello, world.');
  });
});
