import { perplexityMetadataExtractor } from './perplexity-metadata-extractor';

describe('buildMetadataFromResponse', () => {
  it('should extract metadata from complete response with citations, images and usage', () => {
    const response = {
      citations: ['source1', 'source2'],
      images: [
        {
          image_url: 'https://images.com/image1.jpg',
          origin_url: 'https://elsewhere.com/page1',
          height: 100,
          width: 100,
        },
      ],
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
        images: [
          {
            imageUrl: 'https://images.com/image1.jpg',
            originUrl: 'https://elsewhere.com/page1',
            height: 100,
            width: 100,
          },
        ],
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

  it('should extract metadata with only images', () => {
    const response = {
      images: [
        {
          image_url: 'https://images.com/image1.jpg',
          origin_url: 'https://elsewhere.com/page1',
          height: 100,
          width: 100,
        },
      ],
    };

    const metadata = perplexityMetadataExtractor.extractMetadata({
      parsedBody: response,
    });

    expect(metadata).toEqual({
      perplexity: {
        images: [
          {
            imageUrl: 'https://images.com/image1.jpg',
            originUrl: 'https://elsewhere.com/page1',
            height: 100,
            width: 100,
          },
        ],
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

describe('streaming metadata extractor', () => {
  it('should process streaming chunks and build final metadata', () => {
    const extractor = perplexityMetadataExtractor.createStreamExtractor();

    // Process chunk with citations
    extractor.processChunk({
      choices: [{ delta: { role: 'assistant', content: 'content' } }],
      citations: ['source1', 'source2'],
    });

    // Process chunk with images
    extractor.processChunk({
      choices: [{ delta: { role: 'assistant', content: 'content' } }],
      images: [
        {
          image_url: 'https://images.com/image1.jpg',
          origin_url: 'https://elsewhere.com/page1',
          height: 100,
          width: 100,
        },
      ],
    });

    // Process chunk with usage
    extractor.processChunk({
      choices: [{ delta: { role: 'assistant', content: 'content' } }],
      usage: {
        citation_tokens: 100,
        num_search_queries: 5,
      },
    });

    const finalMetadata = extractor.buildMetadata();

    expect(finalMetadata).toEqual({
      perplexity: {
        citations: ['source1', 'source2'],
        images: [
          {
            imageUrl: 'https://images.com/image1.jpg',
            originUrl: 'https://elsewhere.com/page1',
            height: 100,
            width: 100,
          },
        ],
        usage: {
          citationTokens: 100,
          numSearchQueries: 5,
        },
      },
    });
  });

  it('should update metadata with latest chunk data', () => {
    const extractor = perplexityMetadataExtractor.createStreamExtractor();

    // Process initial chunk
    extractor.processChunk({
      citations: ['source1'],
      images: [
        {
          image_url: 'https://images.com/image1.jpg',
          origin_url: 'https://elsewhere.com/page1',
          height: 100,
          width: 100,
        },
      ],
      usage: {
        citation_tokens: 50,
        num_search_queries: 2,
      },
    });

    // Process chunk with updated data
    extractor.processChunk({
      citations: ['source1', 'source2'],
      images: [
        {
          image_url: 'https://images.com/image1.jpg',
          origin_url: 'https://elsewhere.com/page1',
          height: 100,
          width: 100,
        },
        {
          image_url: 'https://images.com/image2.jpg',
          origin_url: 'https://elsewhere.com/page2',
          height: 200,
          width: 200,
        },
      ],
      usage: {
        citation_tokens: 100,
        num_search_queries: 5,
      },
    });

    const finalMetadata = extractor.buildMetadata();

    expect(finalMetadata).toEqual({
      perplexity: {
        citations: ['source1', 'source2'],
        images: [
          {
            imageUrl: 'https://images.com/image1.jpg',
            originUrl: 'https://elsewhere.com/page1',
            height: 100,
            width: 100,
          },
          {
            imageUrl: 'https://images.com/image2.jpg',
            originUrl: 'https://elsewhere.com/page2',
            height: 200,
            width: 200,
          },
        ],
        usage: {
          citationTokens: 100,
          numSearchQueries: 5,
        },
      },
    });
  });

  it('should handle streaming chunks without metadata', () => {
    const extractor = perplexityMetadataExtractor.createStreamExtractor();

    extractor.processChunk({
      choices: [{ delta: { role: 'assistant', content: 'content' } }],
    });

    const finalMetadata = extractor.buildMetadata();

    expect(finalMetadata).toBeUndefined();
  });

  it('should handle invalid streaming chunks', () => {
    const extractor = perplexityMetadataExtractor.createStreamExtractor();

    extractor.processChunk('invalid chunk');

    const finalMetadata = extractor.buildMetadata();

    expect(finalMetadata).toBeUndefined();
  });

  it('should handle null values in usage data', () => {
    const extractor = perplexityMetadataExtractor.createStreamExtractor();

    extractor.processChunk({
      usage: {
        citation_tokens: null,
        num_search_queries: null,
      },
    });

    const finalMetadata = extractor.buildMetadata();

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
