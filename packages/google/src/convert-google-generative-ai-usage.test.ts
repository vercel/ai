import { describe, expect, it } from 'vitest';
import { convertGoogleGenerativeAIUsage } from './convert-google-generative-ai-usage';

describe('convertGoogleGenerativeAIUsage', () => {
  it('returns undefined fields when usage is null', () => {
    expect(convertGoogleGenerativeAIUsage(null)).toEqual({
      inputTokens: {
        total: undefined,
        noCache: undefined,
        cacheRead: undefined,
        cacheWrite: undefined,
      },
      outputTokens: {
        total: undefined,
        text: undefined,
        reasoning: undefined,
      },
      raw: undefined,
    });
  });

  it('maps prompt and candidate tokens for a basic call', () => {
    const usage = convertGoogleGenerativeAIUsage({
      promptTokenCount: 100,
      candidatesTokenCount: 50,
      totalTokenCount: 150,
    });

    expect(usage.inputTokens).toEqual({
      total: 100,
      noCache: 100,
      cacheRead: 0,
      cacheWrite: undefined,
    });
    expect(usage.outputTokens).toEqual({
      total: 50,
      text: 50,
      reasoning: 0,
    });
  });

  it('subtracts cached tokens from noCache while keeping total accurate', () => {
    const usage = convertGoogleGenerativeAIUsage({
      promptTokenCount: 100,
      cachedContentTokenCount: 40,
      candidatesTokenCount: 50,
      totalTokenCount: 150,
    });

    expect(usage.inputTokens).toEqual({
      total: 100,
      noCache: 60,
      cacheRead: 40,
      cacheWrite: undefined,
    });
  });

  it('reports thoughts (reasoning) tokens in output and total', () => {
    const usage = convertGoogleGenerativeAIUsage({
      promptTokenCount: 10,
      candidatesTokenCount: 15,
      thoughtsTokenCount: 8,
      totalTokenCount: 33,
    });

    expect(usage.outputTokens).toEqual({
      total: 23,
      text: 15,
      reasoning: 8,
    });
  });

  it('includes toolUsePromptTokenCount in input tokens', () => {
    // Realistic shape returned by Gemini for a grounded (Google Search) call.
    // Without this, ~20% of the billed tokens silently disappear from the
    // standard usage shape because they live only in totalTokenCount.
    const usage = convertGoogleGenerativeAIUsage({
      promptTokenCount: 70,
      candidatesTokenCount: 53,
      thoughtsTokenCount: 199,
      toolUsePromptTokenCount: 79,
      totalTokenCount: 401,
    });

    expect(usage.inputTokens).toEqual({
      total: 149,
      noCache: 149,
      cacheRead: 0,
      cacheWrite: undefined,
    });
    expect(usage.outputTokens).toEqual({
      total: 252,
      text: 53,
      reasoning: 199,
    });
  });

  it('combines cached content and tool-use prompt tokens correctly', () => {
    const usage = convertGoogleGenerativeAIUsage({
      promptTokenCount: 100,
      cachedContentTokenCount: 30,
      toolUsePromptTokenCount: 50,
      candidatesTokenCount: 20,
      totalTokenCount: 170,
    });

    expect(usage.inputTokens).toEqual({
      total: 150,
      noCache: 120,
      cacheRead: 30,
      cacheWrite: undefined,
    });
  });
});
