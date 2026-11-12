import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import { createAnthropic } from './anthropic-provider';

const fixture = JSON.parse(
  readFileSync('src/__fixtures__/extraction.json', 'utf8'),
);

it('extracts typed fields with Messages structured output', async () => {
  const fetch = vi.fn().mockImplementation(
    async () =>
      new Response(JSON.stringify(fixture), {
        headers: { 'content-type': 'application/json' },
      }),
  );
  const model = createAnthropic({
    apiKey: 'test-key',
    baseURL: 'https://example.com/v1',
    fetch,
  }).extractionModel('claude-sonnet-5-5');

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

  expect(model.provider).toBe('anthropic.extraction');
  expect(model.modelId).toBe('claude-sonnet-5-5');
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
  expect(url).toBe('https://example.com/v1/messages');
  expect(JSON.parse(request.body).output_config).toMatchInlineSnapshot(`
    {
      "format": {
        "schema": {
          "additionalProperties": false,
          "properties": {
            "f0": {
              "anyOf": [
                {
                  "description": "Text copied from the state.",
                  "type": "string",
                },
                {
                  "type": "null",
                },
              ],
            },
            "f1": {
              "anyOf": [
                {
                  "description": "A finite number.",
                  "type": "number",
                },
                {
                  "type": "null",
                },
              ],
            },
            "f2": {
              "anyOf": [
                {
                  "description": "A calendar date formatted as YYYY-MM-DD.",
                  "type": "string",
                },
                {
                  "type": "null",
                },
              ],
            },
            "f3": {
              "anyOf": [
                {
                  "description": "Every matching value in the order it appears in the state.",
                  "items": {
                    "description": "Text copied from the state.",
                    "type": "string",
                  },
                  "type": "array",
                },
                {
                  "type": "null",
                },
              ],
            },
            "f4": {
              "anyOf": [
                {
                  "description": "Text copied from the state.",
                  "type": "string",
                },
                {
                  "type": "null",
                },
              ],
            },
          },
          "required": [
            "f0",
            "f1",
            "f2",
            "f3",
            "f4",
          ],
          "type": "object",
        },
        "type": "json_schema",
      },
    }
  `);
});

it('lists missing fields separately above the 16 union parameter limit', async () => {
  const fetch = vi.fn().mockImplementation(
    async () =>
      new Response(
        JSON.stringify({
          ...fixture,
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                missing: ['f16'],
                values: Object.fromEntries(
                  Array.from({ length: 17 }, (_, i) => [`f${i}`, i]),
                ),
              }),
            },
          ],
        }),
        { headers: { 'content-type': 'application/json' } },
      ),
  );
  const model = createAnthropic({
    apiKey: 'test-key',
    baseURL: 'https://example.com/v1',
    fetch,
  }).extractionModel('claude-sonnet-5-5');

  const result = await model.doExtract({
    state: [{ type: 'text', text: 'Prices.' }],
    fields: Object.fromEntries(
      Array.from({ length: 17 }, (_, i) => [`price ${i}`, { type: 'number' }]),
    ),
  });

  const schema = JSON.parse(fetch.mock.calls[0][1].body).output_config.format
    .schema;
  expect(JSON.stringify(schema)).not.toContain('anyOf');
  expect(Object.keys(schema.properties)).toEqual(['missing', 'values']);
  expect(result.answers['price 15']).toEqual({ type: 'number', value: 15 });
  expect(result.answers['price 16']).toEqual({ type: 'number', value: null });
});
