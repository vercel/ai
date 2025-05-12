import {
  createTestServer,
  TestResponseController,
} from '@ai-sdk/provider-utils/test';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { findByText, screen } from '@testing-library/vue';
import { UIMessageStreamPart } from 'ai';
import TestCompletionComponent from './TestCompletionComponent.vue';
import TestCompletionTextStreamComponent from './TestCompletionTextStreamComponent.vue';
import { setupTestComponent } from './setup-test-component';

function formatStreamPart(part: UIMessageStreamPart) {
  return `data: ${JSON.stringify(part)}\n\n`;
}

const server = createTestServer({
  '/api/completion': {},
});

describe('stream data stream', () => {
  setupTestComponent(TestCompletionComponent);

  it('should show streamed response', async () => {
    server.urls['/api/completion'].response = {
      type: 'stream-chunks',
      chunks: [
        formatStreamPart({ type: 'text', value: 'Hello' }),
        formatStreamPart({ type: 'text', value: ',' }),
        formatStreamPart({ type: 'text', value: ' world' }),
        formatStreamPart({ type: 'text', value: '.' }),
      ],
    };

    await userEvent.type(screen.getByTestId('input'), 'hi{enter}');

    await screen.findByTestId('completion');
    expect(screen.getByTestId('completion')).toHaveTextContent('Hello, world.');
  });

  describe('loading state', () => {
    it('should show loading state', async () => {
      const controller = new TestResponseController();
      server.urls['/api/completion'].response = {
        type: 'controlled-stream',
        controller,
      };

      await userEvent.type(screen.getByTestId('input'), 'hi{enter}');

      await screen.findByTestId('loading');
      expect(screen.getByTestId('loading')).toHaveTextContent('true');

      controller.write(formatStreamPart({ type: 'text', value: 'Hello' }));
      controller.close();

      await findByText(await screen.findByTestId('loading'), 'false');
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });

    it('should reset loading state on error', async () => {
      server.urls['/api/completion'].response = {
        type: 'error',
        status: 404,
        body: 'Not found',
      };

      await userEvent.type(screen.getByTestId('input'), 'hi{enter}');

      await screen.findByTestId('loading');
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });
  });
});

describe('stream data stream', () => {
  setupTestComponent(TestCompletionTextStreamComponent);

  it('should show streamed response', async () => {
    server.urls['/api/completion'].response = {
      type: 'stream-chunks',
      chunks: ['Hello', ',', ' world', '.'],
    };

    await userEvent.type(screen.getByTestId('input'), 'hi{enter}');

    await screen.findByTestId('completion');
    expect(screen.getByTestId('completion')).toHaveTextContent('Hello, world.');
  });
});
