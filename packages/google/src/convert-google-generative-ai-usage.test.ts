import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  convertGoogleGenerativeAIUsage,
  type GoogleGenerativeAIUsageMetadata,
} from './convert-google-generative-ai-usage';

function readRecordedLiveUsage(): GoogleGenerativeAIUsageMetadata {
  const chunks = fs
    .readFileSync(
      'src/__fixtures__/google-tool-use-usage-issue-21027.chunks.txt',
      'utf8',
    )
    .split('\n')
    .filter(line => line.startsWith('data: '));
  const finalResponse = JSON.parse(chunks.at(-1)!.slice('data: '.length));

  return finalResponse.usageMetadata;
}

describe('convertGoogleGenerativeAIUsage', () => {
  it('includes recorded live tool-use prompt tokens in input usage', () => {
    const usage = readRecordedLiveUsage();

    expect(convertGoogleGenerativeAIUsage(usage)).toEqual({
      inputTokens: {
        total: 118,
        noCache: 118,
        cacheRead: 0,
        cacheWrite: undefined,
      },
      outputTokens: {
        total: 90,
        text: 47,
        reasoning: 43,
      },
      raw: usage,
    });
  });

  it('includes tool-use prompt tokens when calculating uncached input', () => {
    expect(
      convertGoogleGenerativeAIUsage({
        promptTokenCount: 55,
        toolUsePromptTokenCount: 89,
        cachedContentTokenCount: 100,
      }).inputTokens,
    ).toEqual({
      total: 144,
      noCache: 44,
      cacheRead: 100,
      cacheWrite: undefined,
    });
  });
});
