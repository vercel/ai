import type { LanguageModelV4 } from '@ai-sdk/provider';
import { extractJsonMiddleware, generateText, wrapLanguageModel } from 'ai';

const rawText = '```json\n{"name":"Paris"}\n```';
const expectedCitedText = 'Paris';
const originalStartIndex = rawText.indexOf(expectedCitedText);

const model: LanguageModelV4 = {
  specificationVersion: 'v4',
  provider: 'mock',
  modelId: 'mock',
  supportedUrls: {},
  async doGenerate() {
    return {
      content: [
        {
          type: 'text',
          text: rawText,
          citations: [
            {
              source: {
                type: 'source',
                sourceType: 'url',
                id: 'source',
                url: 'https://example.com',
                title: 'Synthetic source',
              },
              startIndex: originalStartIndex,
              endIndex: originalStartIndex + expectedCitedText.length,
            },
          ],
        },
      ],
      finishReason: { unified: 'stop', raw: 'stop' },
      usage: {
        inputTokens: {
          total: 1,
          noCache: 1,
          cacheRead: 0,
          cacheWrite: 0,
        },
        outputTokens: { total: 1, text: 1, reasoning: 0 },
      },
      warnings: [],
    };
  },
  async doStream() {
    throw new Error('Streaming is not used by this reproduction.');
  },
};

async function generateAndReadCitation(selectedModel: LanguageModelV4) {
  const result = await generateText({
    model: selectedModel,
    prompt: 'test',
    maxRetries: 0,
  });
  const textPart = result.content.find(part => part.type === 'text');

  if (textPart == null) {
    throw new Error(
      'Reproduction setup failed: generated text part is missing.',
    );
  }

  const citation = textPart.citations?.[0];
  if (citation?.startIndex == null || citation.endIndex == null) {
    throw new Error(
      'Reproduction setup failed: positional citation metadata is missing.',
    );
  }

  return {
    text: textPart.text,
    startIndex: citation.startIndex,
    endIndex: citation.endIndex,
    citedText: textPart.text.slice(citation.startIndex, citation.endIndex),
  };
}

async function main() {
  const plain = await generateAndReadCitation(model);
  if (plain.citedText !== expectedCitedText) {
    throw new Error(
      `Reproduction setup failed: the unwrapped control cited ${JSON.stringify(plain.citedText)}.`,
    );
  }

  const wrapped = await generateAndReadCitation(
    wrapLanguageModel({
      model,
      middleware: extractJsonMiddleware(),
    }),
  );

  console.log(JSON.stringify({ plain, wrapped }, null, 2));

  if (wrapped.citedText !== expectedCitedText) {
    throw new Error(
      `ISSUE_22874: extractJsonMiddleware returned citation offsets [${wrapped.startIndex}, ${wrapped.endIndex}) that resolve to ${JSON.stringify(wrapped.citedText)} instead of "Paris" in the transformed text.`,
    );
  }
}

await main();
