import { withTestServer } from '@ai-sdk/provider-utils/test';
import { Completion } from './completion.svelte.js';
import { render } from '@testing-library/svelte';
import CompletionSynchronization from './tests/completion-synchronization.svelte';

describe('Completion', () => {
  it(
    'should render a data stream',
    withTestServer(
      {
        type: 'stream-values',
        url: '/api/completion',
        content: ['0:"Hello"\n', '0:","\n', '0:" world"\n', '0:"."\n'],
      },
      async () => {
        const completion = new Completion();
        await completion.complete('hi');
        expect(completion.completion).toBe('Hello, world.');
      },
    ),
  );

  it(
    'should render a text stream',
    withTestServer(
      {
        type: 'stream-values',
        url: '/api/completion',
        content: ['Hello', ',', ' world', '.'],
      },
      async () => {
        const completion = new Completion({ streamProtocol: 'text' });
        await completion.complete('hi');
        expect(completion.completion).toBe('Hello, world.');
      },
    ),
  );

  it(
    'should call `onFinish` callback',
    withTestServer(
      {
        type: 'stream-values',
        url: '/api/completion',
        content: ['0:"Hello"\n', '0:","\n', '0:" world"\n', '0:"."\n'],
      },
      async () => {
        const onFinish = vi.fn();
        const completion = new Completion({ onFinish });
        await completion.complete('hi');
        expect(onFinish).toHaveBeenCalledExactlyOnceWith('hi', 'Hello, world.');
      },
    ),
  );

  it(
    'should show loading state',
    withTestServer(
      { url: '/api/completion', type: 'controlled-stream' },
      async ({ streamController }) => {
        const completion = new Completion();
        const completionOperation = completion.complete('hi');
        streamController.enqueue('0:"Hello"\n');
        await vi.waitFor(() => expect(completion.loading).toBe(true));
        streamController.close();
        await completionOperation;
        expect(completion.loading).toBe(false);
      },
    ),
  );

  it(
    'should reset loading state on error',
    withTestServer(
      {
        type: 'error',
        url: '/api/completion',
        status: 404,
        content: 'Not found',
      },
      async () => {
        const completion = new Completion();
        await completion.complete('hi');
        expect(completion.error).toBeInstanceOf(Error);
        expect(completion.loading).toBe(false);
      },
    ),
  );

  it(
    'should reset error state on subsequent completion',
    withTestServer(
      [
        {
          type: 'error',
          url: '/api/completion',
          status: 404,
          content: 'Not found',
        },
        {
          type: 'stream-values',
          url: '/api/completion',
          content: ['0:"Hello"\n', '0:","\n', '0:" world"\n', '0:"."\n'],
        },
      ],
      async () => {
        const completion = new Completion();
        await completion.complete('hi');
        expect(completion.error).toBeInstanceOf(Error);
        expect(completion.loading).toBe(false);
        await completion.complete('hi');
        expect(completion.error).toBe(undefined);
        expect(completion.completion).toBe('Hello, world.');
      },
    ),
  );
});

describe('synchronization', () => {
  it(
    'correctly synchronizes content between hook instances',
    withTestServer(
      {
        type: 'stream-values',
        url: '/api/completion',
        content: ['0:"Hello"\n', '0:","\n', '0:" world"\n', '0:"."\n'],
      },
      async () => {
        const {
          component: { completion1, completion2 },
        } = render(CompletionSynchronization, { id: crypto.randomUUID() });

        await completion1.complete('hi');

        expect(completion1.completion).toBe('Hello, world.');
        expect(completion2.completion).toBe('Hello, world.');
      },
    ),
  );

  it(
    'correctly synchronizes loading and error state between hook instances',
    withTestServer(
      {
        type: 'controlled-stream',
        url: '/api/completion',
      },
      async ({ streamController }) => {
        const {
          component: { completion1, completion2 },
        } = render(CompletionSynchronization, { id: crypto.randomUUID() });

        const completionOperation = completion1.complete('hi');

        await vi.waitFor(() => {
          expect(completion1.loading).toBe(true);
          expect(completion2.loading).toBe(true);
        });

        streamController.enqueue('0:"Hello"\n');
        await vi.waitFor(() => {
          expect(completion1.completion).toBe('Hello');
          expect(completion2.completion).toBe('Hello');
        });

        streamController.error(new Error('Failed to be cool enough'));
        await completionOperation;

        expect(completion1.loading).toBe(false);
        expect(completion2.loading).toBe(false);
        expect(completion1.error).toBeInstanceOf(Error);
        expect(completion1.error?.message).toBe('Failed to be cool enough');
        expect(completion2.error).toBeInstanceOf(Error);
        expect(completion2.error?.message).toBe('Failed to be cool enough');
      },
    ),
  );
});
