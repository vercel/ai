import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import { createGoogle } from './google-provider';

const fixture = JSON.parse(
  readFileSync('src/__fixtures__/extraction.json', 'utf8'),
);

it('extracts typed fields with Gemini structured output', async () => {
  const fetch = vi.fn().mockImplementation(
    async () =>
      new Response(JSON.stringify(fixture), {
        headers: { 'content-type': 'application/json' },
      }),
  );
  const model = createGoogle({
    apiKey: 'test-key',
    baseURL: 'https://example.com/v1beta',
    fetch,
  }).extractionModel('gemini-3.8-flash');

  const result = await model.doExtract({
    state: [
      {
        type: 'text',
        text: 'Invoice INV-2041. Total due $1,250.00 by March 3. Contacts: Ana, Bo.',
      },
    ],
    referenceDate: '2026-11-11',
    fields: {
      invoiceNumber: { type: 'text' },
      total: { type: 'number', decimals: 2 },
      dueDate: { type: 'date' },
      contacts: { type: 'list', items: 'text' },
      purchaseOrder: { type: 'text' },
    },
  });

  expect(model.provider).toBe('google.extraction');
  expect(model.modelId).toBe('gemini-3.8-flash');
  expect(result.answers).toMatchInlineSnapshot(`
    {
      "contacts": {
        "type": "list",
        "value": [
          "Ana",
          "Bo",
        ],
      },
      "dueDate": {
        "type": "date",
        "value": "2027-03-03",
      },
      "invoiceNumber": {
        "type": "text",
        "value": "INV-2041",
      },
      "purchaseOrder": {
        "type": "text",
        "value": null,
      },
      "total": {
        "type": "number",
        "value": 1250,
      },
    }
  `);
  expect(fetch).toHaveBeenCalledTimes(1);
  const [url, request] = fetch.mock.calls[0];
  expect(url).toBe(
    'https://example.com/v1beta/models/gemini-3.8-flash:generateContent',
  );
  const { generationConfig } = JSON.parse(request.body);
  expect(generationConfig.responseMimeType).toBe('application/json');
  expect(generationConfig.responseJsonSchema.required).toEqual([
    'f0',
    'f1',
    'f2',
    'f3',
    'f4',
  ]);
});
