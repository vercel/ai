// @vitest-environment node
import { renderToString } from 'react-dom/server';
import { StrictMode } from 'react';
import { expect, it, vi } from 'vitest';
import { liveModel } from '../../ai/src/realtime/__fixtures__/fake-realtime';

vi.mock('ai', async () => import('../../ai/src/realtime'));
const { experimental_useRealtime } = await import('./use-realtime');

it.each([false, true])(
  'renders disconnected snapshots on React 18 without browser access or layout warnings (StrictMode: %s)',
  strict => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const model = liveModel();
      function Conversation() {
        const rt = experimental_useRealtime({
          model,
          api: { websocket: 'wss://app.example/live' },
        });
        return <p>{rt.status}</p>;
      }
      expect(typeof window).toBe('undefined');
      expect(
        renderToString(
          strict ? (
            <StrictMode>
              <Conversation />
            </StrictMode>
          ) : (
            <Conversation />
          ),
        ),
      ).toBe('<p>disconnected</p>');
      expect(error).not.toHaveBeenCalled();
    } finally {
      error.mockRestore();
    }
  },
);
