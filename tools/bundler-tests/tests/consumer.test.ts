import { expect, test } from '@playwright/test';

const schemas = { schemas: ['zod3', 'zod4'], messages: 1, rejected: true };

test('server bundle validates schemas and generates and streams through a provider', async ({
  request,
}) => {
  const response = await request.get('/api/check');
  expect(response.ok()).toBe(true);
  expect(await response.json()).toEqual({
    schemas,
    generated: 'generated',
    streamed: 'streamed',
  });
});

test('browser bundle initializes lazy schemas after hydration', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Check schemas' }).click();
  await expect(page.getByRole('status')).toHaveText(JSON.stringify(schemas));
  expect(errors).toEqual([]);
});
