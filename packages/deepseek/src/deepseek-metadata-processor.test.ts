import { DeepSeekMetadataProcessor } from './deepseek-metadata-processor';

describe('buildMetadataFromResponse', () => {
  it('should extract metadata from complete response with usage data', () => {
    const response = {
      usage: {
        prompt_cache_hit_tokens: 100,
        prompt_cache_miss_tokens: 50,
      },
    };

    const metadata =
      DeepSeekMetadataProcessor.buildMetadataFromResponse(response);

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

    const metadata =
      DeepSeekMetadataProcessor.buildMetadataFromResponse(response);

    expect(metadata).toBeUndefined();
  });

  it('should handle invalid response data', () => {
    const response = 'invalid data';

    const metadata =
      DeepSeekMetadataProcessor.buildMetadataFromResponse(response);

    expect(metadata).toBeUndefined();
  });
});

describe('streaming metadata processor', () => {
  it('should process streaming chunks and build final metadata', () => {
    const processor =
      DeepSeekMetadataProcessor.createStreamingMetadataProcessor();

    // Process initial chunks without usage data
    processor.processChunk({
      choices: [{ finish_reason: null }],
    });

    // Process final chunk with usage data
    processor.processChunk({
      choices: [{ finish_reason: 'stop' }],
      usage: {
        prompt_cache_hit_tokens: 100,
        prompt_cache_miss_tokens: 50,
      },
    });

    const finalMetadata = processor.buildFinalMetadata();

    expect(finalMetadata).toEqual({
      deepseek: {
        promptCacheHitTokens: 100,
        promptCacheMissTokens: 50,
      },
    });
  });

  it('should handle streaming chunks without usage data', () => {
    const processor =
      DeepSeekMetadataProcessor.createStreamingMetadataProcessor();

    processor.processChunk({
      choices: [{ finish_reason: 'stop' }],
    });

    const finalMetadata = processor.buildFinalMetadata();

    expect(finalMetadata).toBeUndefined();
  });

  it('should handle invalid streaming chunks', () => {
    const processor =
      DeepSeekMetadataProcessor.createStreamingMetadataProcessor();

    processor.processChunk('invalid chunk');

    const finalMetadata = processor.buildFinalMetadata();

    expect(finalMetadata).toBeUndefined();
  });

  it('should only capture usage data from final chunk with stop reason', () => {
    const processor =
      DeepSeekMetadataProcessor.createStreamingMetadataProcessor();

    // Process chunk with usage but no stop reason
    processor.processChunk({
      choices: [{ finish_reason: null }],
      usage: {
        prompt_cache_hit_tokens: 50,
        prompt_cache_miss_tokens: 25,
      },
    });

    // Process final chunk with different usage data
    processor.processChunk({
      choices: [{ finish_reason: 'stop' }],
      usage: {
        prompt_cache_hit_tokens: 100,
        prompt_cache_miss_tokens: 50,
      },
    });

    const finalMetadata = processor.buildFinalMetadata();

    expect(finalMetadata).toEqual({
      deepseek: {
        promptCacheHitTokens: 100,
        promptCacheMissTokens: 50,
      },
    });
  });

  it('should handle null values in usage data', () => {
    const processor =
      DeepSeekMetadataProcessor.createStreamingMetadataProcessor();

    processor.processChunk({
      choices: [{ finish_reason: 'stop' }],
      usage: {
        prompt_cache_hit_tokens: null,
        prompt_cache_miss_tokens: 50,
      },
    });

    const finalMetadata = processor.buildFinalMetadata();

    expect(finalMetadata).toEqual({
      deepseek: {
        promptCacheHitTokens: NaN,
        promptCacheMissTokens: 50,
      },
    });
  });
});
