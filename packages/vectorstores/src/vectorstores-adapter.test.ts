import type { VectorStoreIndex } from '@vectorstores/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { vectorstores, vercelEmbedding } from './vectorstores-adapter';

// Mock @vectorstores/core
vi.mock('@vectorstores/core', () => ({
  formatLLM: vi.fn((nodes: unknown[]) => {
    if (!nodes || nodes.length === 0) {
      return '';
    }
    return nodes
      .map((node: any, index: number) => {
        const text = node.node?.text ?? node.text ?? '';
        const score = node.score;
        const scoreInfo =
          score != null ? ` (relevance: ${score.toFixed(3)})` : '';
        return `[Document ${index + 1}${scoreInfo}]:\n${text}`;
      })
      .join('\n\n');
  }),
}));

describe('vectorstores', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create a tool with default description', () => {
    const mockIndex = {
      asRetriever: () => ({
        retrieve: vi.fn().mockResolvedValue([]),
      }),
    } as unknown as VectorStoreIndex;

    const tool = vectorstores({ index: mockIndex });

    expect(tool.description).toBe(
      'get information from your knowledge base to answer questions.',
    );
  });

  it('should create a tool with custom description', () => {
    const mockIndex = {
      asRetriever: () => ({
        retrieve: vi.fn().mockResolvedValue([]),
      }),
    } as unknown as VectorStoreIndex;

    const tool = vectorstores({
      index: mockIndex,
      description: 'Search product catalog',
    });

    expect(tool.description).toBe('Search product catalog');
  });

  it('should execute and format retrieved nodes', async () => {
    const mockNodes = [
      { node: { text: 'Document 1 content' }, score: 0.95 },
      { node: { text: 'Document 2 content' }, score: 0.88 },
    ];

    const mockRetrieve = vi.fn().mockResolvedValue(mockNodes);
    const mockIndex = {
      asRetriever: () => ({
        retrieve: mockRetrieve,
      }),
    } as unknown as VectorStoreIndex;

    const tool = vectorstores({ index: mockIndex });

    // Execute the tool
    const result = await tool.execute!(
      { query: 'test query' },
      {
        toolCallId: 'test-id',
        messages: [],
      },
    );

    expect(mockRetrieve).toHaveBeenCalledWith({ query: 'test query' });
    expect(result).toContain('Document 1');
    expect(result).toContain('Document 1 content');
    expect(result).toContain('Document 2 content');
    expect(result).toContain('0.950');
    expect(result).toContain('0.880');
  });

  it('should handle empty results', async () => {
    const mockIndex = {
      asRetriever: () => ({
        retrieve: vi.fn().mockResolvedValue([]),
      }),
    } as unknown as VectorStoreIndex;

    const tool = vectorstores({ index: mockIndex });

    const result = await tool.execute!(
      { query: 'test query' },
      {
        toolCallId: 'test-id',
        messages: [],
      },
    );

    expect(result).toBe('No relevant documents found.');
  });

  it('should pass similarityTopK to retriever', () => {
    const mockAsRetriever = vi.fn().mockReturnValue({
      retrieve: vi.fn().mockResolvedValue([]),
    });

    const mockIndex = {
      asRetriever: mockAsRetriever,
    } as unknown as VectorStoreIndex;

    vectorstores({ index: mockIndex, similarityTopK: 5 });

    expect(mockAsRetriever).toHaveBeenCalledWith({ similarityTopK: 5 });
  });
});

describe('vercelEmbedding', () => {
  it('should create an embedding function', async () => {
    const mockEmbeddings = [
      [0.1, 0.2, 0.3],
      [0.4, 0.5, 0.6],
    ];

    // Mock the embedMany function behavior
    const mockModel = {
      specificationVersion: 'v3' as const,
      provider: 'test',
      modelId: 'test-model',
      maxEmbeddingsPerCall: undefined,
      supportsParallelCalls: true,
      doEmbed: vi.fn().mockResolvedValue({
        embeddings: mockEmbeddings,
        usage: { tokens: 10 },
        warnings: [],
      }),
    };

    const embedFunc = vercelEmbedding(mockModel);

    expect(typeof embedFunc).toBe('function');
  });
});
