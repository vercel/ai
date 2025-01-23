import { deepSeekMetadataExtractor } from './deepseek-metadata-extractor';

describe('buildMetadataFromResponse', () => {
  it('should extract metadata from complete response with usage data', () => {
    const response = {
      usage: {
        prompt_cache_hit_tokens: 100,
        prompt_cache_miss_tokens: 50,
      },
    };

    const metadata = deepSeekMetadataExtractor.extractMetadata({
      parsedBody: response,
    });

    expect(metadata).toEqual({
      deepseek: {
        promptCacheHitTokens: 100,
        promptCacheMissTokens: 50,
      },
    });
  });

  it('should handle missing usage data', () => {
    const response = {
      id: 'test-id',
      choices: [],
    };

    const metadata = deepSeekMetadataExtractor.extractMetadata({
      parsedBody: response,
    });

    expect(metadata).toBeUndefined();
  });

  it('should handle invalid response data', () => {
    const response = 'invalid data';

    const metadata = deepSeekMetadataExtractor.extractMetadata({
      parsedBody: response,
    });

    expect(metadata).toBeUndefined();
  });
});

describe('streaming metadata extractor', () => {
  it('should process streaming chunks and build final metadata', () => {
    const extractor = deepSeekMetadataExtractor.createStreamExtractor();

    // Process initial chunks without usage data
    extractor.processChunk({
      choices: [{ finish_reason: null }],
    });

    // Process final chunk with usage data
    extractor.processChunk({
      choices: [{ finish_reason: 'stop' }],
      usage: {
        prompt_cache_hit_tokens: 100,
        prompt_cache_miss_tokens: 50,
      },
    });

    const finalMetadata = extractor.buildMetadata();

    expect(finalMetadata).toEqual({
      deepseek: {
        promptCacheHitTokens: 100,
        promptCacheMissTokens: 50,
      },
    });
  });

  it('should handle streaming chunks without usage data', () => {
    const extractor = deepSeekMetadataExtractor.createStreamExtractor();

    extractor.processChunk({
      choices: [{ finish_reason: 'stop' }],
    });

    const finalMetadata = extractor.buildMetadata();

    expect(finalMetadata).toBeUndefined();
  });

  it('should handle invalid streaming chunks', () => {
    const extractor = deepSeekMetadataExtractor.createStreamExtractor();

    extractor.processChunk('invalid chunk');

    const finalMetadata = extractor.buildMetadata();

    expect(finalMetadata).toBeUndefined();
  });

  it('should only capture usage data from final chunk with stop reason', () => {
    const extractor = deepSeekMetadataExtractor.createStreamExtractor();

    // Process chunk with usage but no stop reason
    extractor.processChunk({
      choices: [{ finish_reason: null }],
      usage: {
        prompt_cache_hit_tokens: 50,
        prompt_cache_miss_tokens: 25,
      },
    });

    // Process final chunk with different usage data
    extractor.processChunk({
      choices: [{ finish_reason: 'stop' }],
      usage: {
        prompt_cache_hit_tokens: 100,
        prompt_cache_miss_tokens: 50,
      },
    });

    const finalMetadata = extractor.buildMetadata();

    expect(finalMetadata).toEqual({
      deepseek: {
        promptCacheHitTokens: 100,
        promptCacheMissTokens: 50,
      },
    });
  });

  it('should handle null values in usage data', () => {
    const extractor = deepSeekMetadataExtractor.createStreamExtractor();

    extractor.processChunk({
      choices: [{ finish_reason: 'stop' }],
      usage: {
        prompt_cache_hit_tokens: null,
        prompt_cache_miss_tokens: 50,
      },
    });

    const finalMetadata = extractor.buildMetadata();

    expect(finalMetadata).toEqual({
      deepseek: {
        promptCacheHitTokens: NaN,
        promptCacheMissTokens: 50,
      },
    });
  });
});
