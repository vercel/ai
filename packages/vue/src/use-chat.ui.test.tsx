import { withTestServer } from '@ai-sdk/provider-utils/test';
import { formatStreamPart } from '@ai-sdk/ui-utils';
import {
  mockFetchDataStream,
  mockFetchDataStreamWithGenerator,
  mockFetchError,
} from '@ai-sdk/ui-utils/test';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { cleanup, findByText, render, screen } from '@testing-library/vue';
import TestChatComponent from './TestChatComponent.vue';
import TestChatFormComponent from './TestChatFormComponent.vue';
import TestChatFormOptionsComponent from './TestChatFormOptionsComponent.vue';
import TestChatReloadComponent from './TestChatReloadComponent.vue';
import TestChatTextStreamComponent from './TestChatTextStreamComponent.vue';

describe('stream data stream', () => {
  beforeEach(() => {
    render(TestChatComponent);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
  });

  it('should show streamed response', async () => {
    mockFetchDataStream({
      url: 'https://example.com/api/chat',
      chunks: ['0:"Hello"\n', '0:","\n', '0:" world"\n', '0:"."\n'],
    });

    await userEvent.click(screen.getByTestId('do-append'));

    await screen.findByTestId('message-0');
    expect(screen.getByTestId('message-0')).toHaveTextContent('User: hi');

    await screen.findByTestId('message-1');
    expect(screen.getByTestId('message-1')).toHaveTextContent(
      'AI: Hello, world.',
    );
  });

  it('should show streamed response with data', async () => {
    mockFetchDataStream({
      url: 'https://example.com/api/chat',
      chunks: ['2:[{"t1":"v1"}]\n', '0:"Hello"\n'],
    });

    await userEvent.click(screen.getByTestId('do-append'));

    await screen.findByTestId('data');
    expect(screen.getByTestId('data')).toHaveTextContent('[{"t1":"v1"}]');

    await screen.findByTestId('message-1');
    expect(screen.getByTestId('message-1')).toHaveTextContent('AI: Hello');
  });

  it('should show error response', async () => {
    mockFetchError({ statusCode: 404, errorMessage: 'Not found' });

    await userEvent.click(screen.getByTestId('do-append'));

    // TODO bug? the user message does not show up
    // await screen.findByTestId('message-0');
    // expect(screen.getByTestId('message-0')).toHaveTextContent('User: hi');

    await screen.findByTestId('error');
    expect(screen.getByTestId('error')).toHaveTextContent('Error: Not found');
  });

  describe('loading state', () => {
    it('should show loading state', async () => {
      let finishGeneration: ((value?: unknown) => void) | undefined;
      const finishGenerationPromise = new Promise(resolve => {
        finishGeneration = resolve;
      });

      mockFetchDataStreamWithGenerator({
        url: 'https://example.com/api/chat',
        chunkGenerator: (async function* generate() {
          const encoder = new TextEncoder();
          yield encoder.encode('0:"Hello"\n');
          await finishGenerationPromise;
        })(),
      });

      await userEvent.click(screen.getByTestId('do-append'));

      await screen.findByTestId('loading');
      expect(screen.getByTestId('loading')).toHaveTextContent('true');

      finishGeneration?.();

      await findByText(await screen.findByTestId('loading'), 'false');

      expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });

    it('should reset loading state on error', async () => {
      mockFetchError({ statusCode: 404, errorMessage: 'Not found' });

      await userEvent.click(screen.getByTestId('do-append'));

      await screen.findByTestId('loading');
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });
  });

  it(
    'should invoke onFinish when the stream finishes',
    withTestServer(
      {
        url: '/api/chat',
        type: 'stream-values',
        content: [
          formatStreamPart('text', 'Hello'),
          formatStreamPart('text', ','),
          formatStreamPart('text', ' world'),
          formatStreamPart('text', '.'),
          formatStreamPart('finish_message', {
            finishReason: 'stop',
            usage: { completionTokens: 1, promptTokens: 3 },
          }),
        ],
      },
      async () => {
        await userEvent.click(screen.getByTestId('do-append'));

        await screen.findByTestId('message-1');

        const onFinishCalls = screen.getByTestId('on-finish-calls');
        const onFinishCallsText = onFinishCalls.textContent ?? '';
        expect(JSON.parse(onFinishCallsText)).toStrictEqual([
          {
            message: {
              id: expect.any(String),
              createdAt: expect.any(String),
              role: 'assistant',
              content: 'Hello, world.',
            },
            options: {
              finishReason: 'stop',
              usage: {
                completionTokens: 1,
                promptTokens: 3,
                totalTokens: 4,
              },
            },
          },
        ]);
      },
    ),
  );
});

describe('text stream', () => {
  beforeEach(() => {
    render(TestChatTextStreamComponent);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
  });

  it('should show streamed response', async () => {
    mockFetchDataStream({
      url: 'https://example.com/api/chat',
      chunks: ['Hello', ',', ' world', '.'],
    });

    await userEvent.click(screen.getByTestId('do-append'));

    await screen.findByTestId('message-0');
    expect(screen.getByTestId('message-0')).toHaveTextContent('User: hi');

    await screen.findByTestId('message-1');
    expect(screen.getByTestId('message-1')).toHaveTextContent(
      'AI: Hello, world.',
    );
  });

  it(
    'should invoke onFinish when the stream finishes',
    withTestServer(
      {
        url: '/api/chat',
        type: 'stream-values',
        content: ['Hello', ',', ' world', '.'],
      },
      async () => {
        await userEvent.click(screen.getByTestId('do-append'));

        await screen.findByTestId('message-1');

        const onFinishCalls = screen.getByTestId('on-finish-calls');
        const onFinishCallsText = onFinishCalls.textContent ?? '';
        expect(JSON.parse(onFinishCallsText)).toStrictEqual([
          {
            message: {
              id: expect.any(String),
              createdAt: expect.any(String),
              role: 'assistant',
              content: 'Hello, world.',
            },
            options: {
              finishReason: 'unknown',
              usage: {
                // note: originally NaN (lost in JSON stringify)
                completionTokens: null,
                promptTokens: null,
                totalTokens: null,
              },
            },
          },
        ]);
      },
    ),
  );
});

describe('form actions', () => {
  beforeEach(() => {
    render(TestChatFormComponent);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
  });

  it('should show streamed response using handleSubmit', async () => {
    mockFetchDataStream({
      url: 'https://example.com/api/chat',
      chunks: ['Hello', ',', ' world', '.'].map(token =>
        formatStreamPart('text', token),
      ),
    });

    const firstInput = screen.getByTestId('do-input');
    await userEvent.type(firstInput, 'hi');
    await userEvent.keyboard('{Enter}');

    await screen.findByTestId('message-0');
    expect(screen.getByTestId('message-0')).toHaveTextContent('User: hi');

    await screen.findByTestId('message-1');
    expect(screen.getByTestId('message-1')).toHaveTextContent(
      'AI: Hello, world.',
    );

    mockFetchDataStream({
      url: 'https://example.com/api/chat',
      chunks: ['How', ' can', ' I', ' help', ' you', '?'].map(token =>
        formatStreamPart('text', token),
      ),
    });

    const secondInput = screen.getByTestId('do-input');
    await userEvent.type(secondInput, '{Enter}');

    expect(screen.queryByTestId('message-2')).not.toBeInTheDocument();
  });
});

describe('form actions (with options)', () => {
  beforeEach(() => {
    render(TestChatFormOptionsComponent);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
  });

  it('should show streamed response using handleSubmit', async () => {
    mockFetchDataStream({
      url: 'https://example.com/api/chat',
      chunks: ['Hello', ',', ' world', '.'].map(token =>
        formatStreamPart('text', token),
      ),
    });

    const firstInput = screen.getByTestId('do-input');
    await userEvent.type(firstInput, 'hi');
    await userEvent.keyboard('{Enter}');

    await screen.findByTestId('message-0');
    expect(screen.getByTestId('message-0')).toHaveTextContent('User: hi');

    await screen.findByTestId('message-1');
    expect(screen.getByTestId('message-1')).toHaveTextContent(
      'AI: Hello, world.',
    );

    mockFetchDataStream({
      url: 'https://example.com/api/chat',
      chunks: ['How', ' can', ' I', ' help', ' you', '?'].map(token =>
        formatStreamPart('text', token),
      ),
    });

    const secondInput = screen.getByTestId('do-input');
    await userEvent.type(secondInput, '{Enter}');

    await screen.findByTestId('message-2');
    expect(screen.getByTestId('message-2')).toHaveTextContent(
      'AI: How can I help you?',
    );

    mockFetchDataStream({
      url: 'https://example.com/api/chat',
      chunks: ['The', ' sky', ' is', ' blue.'].map(token =>
        formatStreamPart('text', token),
      ),
    });

    const thirdInput = screen.getByTestId('do-input');
    await userEvent.type(thirdInput, 'what color is the sky?');
    await userEvent.keyboard('{Enter}');

    await screen.findByTestId('message-3');
    expect(screen.getByTestId('message-3')).toHaveTextContent(
      'User: what color is the sky?',
    );

    await screen.findByTestId('message-4');
    expect(screen.getByTestId('message-4')).toHaveTextContent(
      'AI: The sky is blue.',
    );
  });
});

describe('reload', () => {
  beforeEach(() => {
    render(TestChatReloadComponent);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
  });

  it(
    'should show streamed response',
    withTestServer(
      [
        {
          url: '/api/chat',
          type: 'stream-values',
          content: ['0:"first response"\n'],
        },
        {
          url: '/api/chat',
          type: 'stream-values',
          content: ['0:"second response"\n'],
        },
      ],
      async ({ call }) => {
        await userEvent.click(screen.getByTestId('do-append'));

        await screen.findByTestId('message-0');
        expect(screen.getByTestId('message-0')).toHaveTextContent('User: hi');

        await screen.findByTestId('message-1');

        // setup done, click reload:
        await userEvent.click(screen.getByTestId('do-reload'));

        expect(await call(1).getRequestBodyJson()).toStrictEqual({
          messages: [{ content: 'hi', role: 'user' }],
          data: { 'test-data-key': 'test-data-value' },
          'request-body-key': 'request-body-value',
        });

        expect(call(1).getRequestHeaders()).toStrictEqual({
          'content-type': 'application/json',
          'header-key': 'header-value',
        });

        await screen.findByTestId('message-1');
        expect(screen.getByTestId('message-1')).toHaveTextContent(
          'AI: second response',
        );
      },
    ),
  );
});
