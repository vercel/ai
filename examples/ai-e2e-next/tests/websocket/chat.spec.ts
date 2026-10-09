import { expect, test, type Page, type WebSocket } from '@playwright/test';
import { safeParseJSON } from '@ai-sdk/provider-utils';

async function sendMessage(page: Page, text: string) {
  await page.getByLabel('Message', { exact: true }).fill(text);
  await page.getByRole('button', { name: 'Send', exact: true }).click();
}

function observeSockets(page: Page) {
  const sockets: WebSocket[] = [];
  const frames: Array<{ type: string; messages?: unknown[] }> = [];
  page.on('websocket', socket => {
    if (new URL(socket.url()).pathname !== '/chat') return;
    sockets.push(socket);
    socket.on('framesent', async ({ payload }) => {
      const result = await safeParseJSON({ text: payload.toString() });
      if (result.success) frames.push(result.value as (typeof frames)[number]);
    });
  });
  return { sockets, frames };
}

test('streams two turns and closes its owned connection when leaving the page', async ({
  page,
}) => {
  const { sockets } = observeSockets(page);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/chat/websocket');
  for (const text of ['first turn', 'second turn']) {
    await sendMessage(page, text);
    await expect(
      page.locator('article[data-role="assistant"]').last(),
    ).toContainText(
      `You said: ${text}. This response streamed over WebSocket.`,
    );
    await expect(page.getByRole('status')).toHaveText('Status: ready');
  }
  await expect(page.locator('article')).toHaveCount(4);
  expect(sockets).toHaveLength(1);
  await page.getByRole('link', { name: 'All examples' }).click();
  await expect.poll(() => sockets[0].isClosed()).toBe(true);
  expect(errors).toEqual([]);
});

test('sends browser tool output back on the same connection', async ({
  page,
}) => {
  const { sockets, frames } = observeSockets(page);
  await page.goto('/chat/websocket');
  await sendMessage(page, 'What is my time zone?');
  await expect(page.locator('article[data-role="assistant"]')).toContainText(
    'Your browser time zone is America/Los_Angeles.',
  );
  await expect(page.getByRole('status')).toHaveText('Status: ready');
  expect(sockets).toHaveLength(1);
  const sends = frames.filter(frame => frame.type === 'send');
  expect(sends).toHaveLength(2);
  expect(sends[1].messages).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        parts: expect.arrayContaining([
          expect.objectContaining({
            type: 'tool-getTimezone',
            state: 'output-available',
            output: 'America/Los_Angeles',
          }),
        ]),
      }),
    ]),
  );
});

test('resumes a partial response without duplicating the assistant message', async ({
  page,
}) => {
  const { sockets, frames } = observeSockets(page);
  await page.goto('/chat/websocket');
  await sendMessage(page, 'resume this response');
  const assistant = page.locator('article[data-role="assistant"]');
  await expect(assistant).toContainText('You said:');
  const id = await assistant.getAttribute('data-message-id');
  await page.getByRole('button', { name: 'Disconnect', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Status: error');
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await expect(assistant).toHaveText(
    'AssistantYou said: resume this response. This response streamed over WebSocket.',
  );
  await expect(page.getByRole('status')).toHaveText('Status: ready');
  await expect(assistant).toHaveAttribute('data-message-id', id!);
  await expect(assistant).toHaveCount(1);
  expect(sockets).toHaveLength(2);
  expect(frames.filter(frame => frame.type === 'resume')).toHaveLength(1);
  expect(frames.filter(frame => frame.type === 'send')).toHaveLength(1);
});

test('cancels server work and accepts another turn', async ({ page }) => {
  const { sockets, frames } = observeSockets(page);
  await page.goto('/chat/websocket');
  await sendMessage(page, 'stop this response');
  await expect(page.locator('article[data-role="assistant"]')).toContainText(
    'You said:',
  );
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Status: ready');
  await expect
    .poll(() => frames.some(frame => frame.type === 'abort'))
    .toBe(true);
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await expect
    .poll(() => frames.some(frame => frame.type === 'resume'))
    .toBe(true);
  await expect(page.getByRole('status')).toHaveText('Status: ready');
  await sendMessage(page, 'after cancellation');
  await expect(
    page.locator('article[data-role="assistant"]').last(),
  ).toContainText(
    'You said: after cancellation. This response streamed over WebSocket.',
  );
  await expect(page.getByRole('status')).toHaveText('Status: ready');
  expect(sockets).toHaveLength(1);
  await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0);
});
