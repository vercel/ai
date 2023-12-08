import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { mockFetchDataStream, mockFetchError } from '../tests/utils/mock-fetch';
import TestComponent from './TestComponent.svelte';

beforeEach(() => {
  render(TestComponent);
});

afterEach(() => {
  vi.restoreAllMocks();
});

it('should return messages', async () => {
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

it('should return messages and data', async () => {
  mockFetchDataStream({
    url: 'https://example.com/api/chat',
    chunks: ['2:[{"t1":"v1"}]\n', '0:"Hello"\n'],
  });

  await userEvent.click(screen.getByTestId('button'));

  await screen.findByTestId('data');
  expect(screen.getByTestId('data')).toHaveTextContent('[{"t1":"v1"}]');

  await screen.findByTestId('message-1');
  expect(screen.getByTestId('message-1')).toHaveTextContent('AI: Hello');
});

it('should return error', async () => {
  mockFetchError({ statusCode: 404, errorMessage: 'Not found' });

  await userEvent.click(screen.getByTestId('button'));

  // TODO bug? the user message does not show up
  // await screen.findByTestId('message-0');
  // expect(screen.getByTestId('message-0')).toHaveTextContent('User: hi');

  await screen.findByTestId('error');
  expect(screen.getByTestId('error')).toHaveTextContent('Error: Not found');
});
