import { perplexityMetadataExtractor } from './perplexity-metadata-extractor';

describe('buildMetadataFromResponse', () => {
  it('should extract metadata from complete response with citations and usage', () => {
    const response = {
      citations: ['source1', 'source2'],
      usage: {
        citation_tokens: 100,
        num_search_queries: 5,
      },
    };

    const metadata = perplexityMetadataExtractor.extractMetadata({
      parsedBody: response,
    });

    expect(metadata).toEqual({
      perplexity: {
        citations: ['source1', 'source2'],
        usage: {
          citationTokens: 100,
          numSearchQueries: 5,
        },
      },
    });
  });

  it('should extract metadata with only citations', () => {
    const response = {
      citations: ['source1', 'source2'],
    };

    const metadata = perplexityMetadataExtractor.extractMetadata({
      parsedBody: response,
    });

    expect(metadata).toEqual({
      perplexity: {
        citations: ['source1', 'source2'],
      },
    });
  });

  it('should extract metadata with only usage', () => {
    const response = {
      usage: {
        citation_tokens: 100,
        num_search_queries: 5,
      },
    };

    const metadata = perplexityMetadataExtractor.extractMetadata({
      parsedBody: response,
    });

    expect(metadata).toEqual({
      perplexity: {
        usage: {
          citationTokens: 100,
          numSearchQueries: 5,
        },
      },
    });
  });

  it('should handle missing metadata', () => {
    const response = {
      id: 'test-id',
      choices: [],
    };

    const metadata = perplexityMetadataExtractor.extractMetadata({
      parsedBody: response,
    });

    expect(metadata).toBeUndefined();
  });

  it('should handle invalid response data', () => {
    const response = 'invalid data';

    const metadata = perplexityMetadataExtractor.extractMetadata({
      parsedBody: response,
    });

    expect(metadata).toBeUndefined();
  });
});

describe('streaming metadata processor', () => {
  it('should process streaming chunks and build final metadata', () => {
    const processor = perplexityMetadataExtractor.createStreamExtractor();

    // Process chunk with citations
    processor.processChunk({
      choices: [{ delta: { role: 'assistant', content: 'content' } }],
      citations: ['source1', 'source2'],
    });

    // Process chunk with usage
    processor.processChunk({
      choices: [{ delta: { role: 'assistant', content: 'content' } }],
      usage: {
        citation_tokens: 100,
        num_search_queries: 5,
      },
    });

    const finalMetadata = processor.buildMetadata();

    expect(finalMetadata).toEqual({
      perplexity: {
        citations: ['source1', 'source2'],
        usage: {
          citationTokens: 100,
          numSearchQueries: 5,
        },
      },
    });
  });

  it('should update metadata with latest chunk data', () => {
    const processor = perplexityMetadataExtractor.createStreamExtractor();

    // Process initial chunk
    processor.processChunk({
      citations: ['source1'],
      usage: {
        citation_tokens: 50,
        num_search_queries: 2,
      },
    });

    // Process chunk with updated data
    processor.processChunk({
      citations: ['source1', 'source2'],
      usage: {
        citation_tokens: 100,
        num_search_queries: 5,
      },
    });

    const finalMetadata = processor.buildMetadata();

    expect(finalMetadata).toEqual({
      perplexity: {
        citations: ['source1', 'source2'],
        usage: {
          citationTokens: 100,
          numSearchQueries: 5,
        },
      },
    });
  });

  it('should handle streaming chunks without metadata', () => {
    const processor = perplexityMetadataExtractor.createStreamExtractor();

    processor.processChunk({
      choices: [{ delta: { role: 'assistant', content: 'content' } }],
    });

    const finalMetadata = processor.buildMetadata();

    expect(finalMetadata).toBeUndefined();
  });

  it('should handle invalid streaming chunks', () => {
    const processor = perplexityMetadataExtractor.createStreamExtractor();

    processor.processChunk('invalid chunk');

    const finalMetadata = processor.buildMetadata();

    expect(finalMetadata).toBeUndefined();
  });

  it('should handle null values in usage data', () => {
    const processor = perplexityMetadataExtractor.createStreamExtractor();

    processor.processChunk({
      usage: {
        citation_tokens: null,
        num_search_queries: null,
      },
    });

    const finalMetadata = processor.buildMetadata();

    expect(finalMetadata).toEqual({
      perplexity: {
        usage: {
          citationTokens: NaN,
          numSearchQueries: NaN,
        },
      },
    });
  });
});
