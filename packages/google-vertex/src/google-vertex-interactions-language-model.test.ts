import type { LanguageModelV4Prompt } from '@ai-sdk/provider';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createGoogleVertex } from './google-vertex-provider-base';

const TEST_URL =
  'https://aiplatform.googleapis.com/v1beta1/projects/test-project/locations/global/interactions';
const TEST_PROMPT: LanguageModelV4Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];
const TEST_RESPONSE = {
  id: 'interaction_test',
  object: 'interaction',
  status: 'completed',
  model: 'gemini-2.5-flash',
  steps: [{ type: 'model_output', content: [{ type: 'text', text: 'Hello' }] }],
};
const LABEL_CASES: Array<{
  name: string;
  labels: Record<string, string> | undefined;
}> = [
  { name: 'omitted', labels: undefined },
  { name: 'empty', labels: {} },
  {
    name: 'provided',
    labels: { application: 'example', safety_identifier: 'opaque_user_123' },
  },
];

describe.each(['generate', 'stream'] as const)(
  'Vertex Interactions labels (%s)',
  mode => {
    const server = createTestServer({ [TEST_URL]: {} });
    const model = createGoogleVertex({
      project: 'test-project',
      location: 'global',
      headers: { Authorization: 'Bearer test-token' },
    }).interactions('gemini-2.5-flash');

    beforeEach(() => {
      server.urls[TEST_URL].response =
        mode === 'generate'
          ? { type: 'json-value', body: TEST_RESPONSE }
          : {
              type: 'stream-chunks',
              chunks: [
                {
                  event_type: 'interaction.created',
                  interaction: {
                    id: TEST_RESPONSE.id,
                    status: 'in_progress',
                    model: TEST_RESPONSE.model,
                  },
                },
                {
                  event_type: 'interaction.completed',
                  interaction: TEST_RESPONSE,
                },
              ].map(event => `data: ${JSON.stringify(event)}\n\n`),
            };
    });

    it.each(LABEL_CASES)(
      'preserves $name labels and other options',
      async ({ labels }) => {
        const options = {
          prompt: TEST_PROMPT,
          providerOptions: { google: { labels, store: false } },
        };
        if (mode === 'generate') {
          await model.doGenerate(options);
        } else {
          const { stream } = await model.doStream(options);
          await convertReadableStreamToArray(stream);
        }

        const body = await server.calls[0].requestBodyJson;
        expect(body.store).toBe(false);
        if (labels === undefined) {
          expect(body).not.toHaveProperty('labels');
        } else {
          expect(body.labels).toEqual(labels);
        }
      },
    );
  },
);
