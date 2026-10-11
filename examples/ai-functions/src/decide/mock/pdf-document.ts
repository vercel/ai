import type { LanguageModelV4 } from '@ai-sdk/provider';
import { Experimental_DecisionLanguageModel as DecisionLanguageModel } from '@ai-sdk/provider-utils/experimental-decision';
import { experimental_decide } from 'ai';
import assert from 'node:assert/strict';
import { run } from '../../lib/run';

const document = {
  type: 'file' as const,
  filename: 'invoice.pdf',
  mediaType: 'application/pdf',
  data: {
    type: 'data' as const,
    data: new TextEncoder().encode('%PDF-1.4 synthetic invoice fixture'),
  },
  providerOptions: { mock: { documentMode: 'native' } },
};

const languageModel: LanguageModelV4 = {
  specificationVersion: 'v4',
  provider: 'mock',
  modelId: 'pdf-capable-model',
  supportedUrls: {},
  async doGenerate(options) {
    const userMessage = options.prompt.find(message => message.role === 'user');
    assert.ok(userMessage != null && Array.isArray(userMessage.content));
    const forwardedDocument = userMessage.content.find(
      part => part.type === 'file',
    );
    assert.deepEqual(forwardedDocument, document);

    return {
      content: [{ type: 'text', text: '{"q0":0.95}' }],
      finishReason: { unified: 'stop', raw: 'stop' },
      warnings: [],
      usage: {
        inputTokens: {
          total: 10,
          noCache: 10,
          cacheRead: 0,
          cacheWrite: 0,
        },
        outputTokens: { total: 4, text: 4, reasoning: 0 },
      },
    };
  },
  async doStream() {
    throw new Error('Streaming is not used by the decision adapter.');
  },
};

run(async () => {
  const result = await experimental_decide({
    model: new DecisionLanguageModel({ model: languageModel }),
    state: [
      { type: 'text', text: 'Review this invoice.' },
      document,
      { type: 'json', value: { expectedVendor: 'Acme' } },
    ],
    questions: {
      relevant: {
        type: 'boolean',
        instructions: 'Is this invoice relevant to the expected vendor?',
      },
    },
  });

  assert.equal(result.answers.relevant.probability, 0.95);
  console.log(result.answers);
});
