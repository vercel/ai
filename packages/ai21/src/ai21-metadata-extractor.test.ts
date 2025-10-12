import { ai21MetadataExtractor } from './ai21-metadata-extractor';
import { describe, it, expect } from 'vitest';

describe('buildMetadataFromResponse', () => {
  it('should extract metadata from complete response with usage data', async () => {
    const response = {
      usage: {
        prompt_cache_hit_tokens: 100,
        prompt_cache_miss_tokens: 50,
      },
    };

    const metadata = await ai21MetadataExtractor.extractMetadata({
      parsedBody: response,
    });

    expect(metadata).toEqual({
      ai21: {
        promptCacheHitTokens: 100,
        promptCacheMissTokens: 50,
      },
    });
  });

  it('should handle missing usage data', async () => {
    const response = {
      id: 'test-id',
      choices: [],
    };

    const metadata = await ai21MetadataExtractor.extractMetadata({
      parsedBody: response,
    });

    expect(metadata).toBeUndefined();
  });

  it('should handle invalid response data', async () => {
    const response = 'invalid data';

    const metadata = await ai21MetadataExtractor.extractMetadata({
      parsedBody: response,
    });

    expect(metadata).toBeUndefined();
  });
});

describe('streaming metadata extractor', () => {
  it('should process streaming chunks and build final metadata', async () => {
    const extractor = ai21MetadataExtractor.createStreamExtractor();

    // Process initial chunks without usage data
    await extractor.processChunk({
      choices: [{ finish_reason: null }],
    });

    // Process final chunk with usage data
    await extractor.processChunk({
      choices: [{ finish_reason: 'stop' }],
      usage: {
        prompt_cache_hit_tokens: 100,
        prompt_cache_miss_tokens: 50,
      },
    });

    const finalMetadata = extractor.buildMetadata();

    expect(finalMetadata).toEqual({
      ai21: {
        promptCacheHitTokens: 100,
        promptCacheMissTokens: 50,
      },
    });
  });

  it('should handle streaming chunks without usage data', async () => {
    const extractor = ai21MetadataExtractor.createStreamExtractor();

    await extractor.processChunk({
      choices: [{ finish_reason: 'stop' }],
    });

    const finalMetadata = extractor.buildMetadata();

    expect(finalMetadata).toBeUndefined();
  });

  it('should handle invalid streaming chunks', async () => {
    const extractor = ai21MetadataExtractor.createStreamExtractor();

    await extractor.processChunk('invalid chunk');

    const finalMetadata = extractor.buildMetadata();

    expect(finalMetadata).toBeUndefined();
  });

  it('should only capture usage data from final chunk with stop reason', async () => {
    const extractor = ai21MetadataExtractor.createStreamExtractor();

    // Process chunk with usage but no stop reason
    await extractor.processChunk({
      choices: [{ finish_reason: null }],
      usage: {
        prompt_cache_hit_tokens: 50,
        prompt_cache_miss_tokens: 25,
      },
    });

    // Process final chunk with different usage data
    await extractor.processChunk({
      choices: [{ finish_reason: 'stop' }],
      usage: {
        prompt_cache_hit_tokens: 100,
        prompt_cache_miss_tokens: 50,
      },
    });

    const finalMetadata = extractor.buildMetadata();

    expect(finalMetadata).toEqual({
      ai21: {
        promptCacheHitTokens: 100,
        promptCacheMissTokens: 50,
      },
    });
  });

  it('should handle null values in usage data', async () => {
    const extractor = ai21MetadataExtractor.createStreamExtractor();

    await extractor.processChunk({
      choices: [{ finish_reason: 'stop' }],
      usage: {
        prompt_cache_hit_tokens: null,
        prompt_cache_miss_tokens: 50,
      },
    });

    const finalMetadata = extractor.buildMetadata();

    expect(finalMetadata).toEqual({
      ai21: {
        promptCacheHitTokens: NaN,
        promptCacheMissTokens: 50,
      },
    });
  });
});
