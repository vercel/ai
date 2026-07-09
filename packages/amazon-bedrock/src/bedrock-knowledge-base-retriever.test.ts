import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSend = vi.fn();
const mockRetrieveCommandCalls: any[] = [];

vi.mock('@aws-sdk/client-bedrock-agent-runtime', () => ({
  BedrockAgentRuntimeClient: class MockClient {
    send = mockSend;
  },
  RetrieveCommand: class MockRetrieveCommand {
    constructor(public input: any) {
      mockRetrieveCommandCalls.push(input);
    }
  },
}));

// eslint-disable-next-line import/first
import { bedrockKnowledgeBaseRetriever } from './bedrock-knowledge-base-retriever';

describe('bedrockKnowledgeBaseRetriever', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSend.mockResolvedValue({ retrievalResults: [] });
    mockRetrieveCommandCalls.length = 0;
  });

  it('creates a retriever with required options', () => {
    const retriever = bedrockKnowledgeBaseRetriever({
      knowledgeBaseId: 'TEST123456',
    });
    expect(retriever).toBeDefined();
    expect(retriever.retrieve).toBeInstanceOf(Function);
  });

  it('uses managed search config by default', async () => {
    mockSend.mockResolvedValue({
      retrievalResults: [
        { content: { text: 'test doc' }, location: { s3Location: { uri: 's3://b/d.pdf' } }, score: 0.9 },
      ],
    });

    const retriever = bedrockKnowledgeBaseRetriever({ knowledgeBaseId: 'TEST123456' });
    const results = await retriever.retrieve('test query');

    expect(mockRetrieveCommandCalls[0]).toEqual(
      expect.objectContaining({
        knowledgeBaseId: 'TEST123456',
        retrievalConfiguration: { managedSearchConfiguration: { numberOfResults: 5 } },
      }),
    );
    expect(results.results).toHaveLength(1);
    expect(results.results[0].content).toBe('test doc');
    expect(results.results[0].source).toBe('s3://b/d.pdf');
    expect(results.results[0].score).toBe(0.9);
  });

  it('returns empty array when no results', async () => {
    const retriever = bedrockKnowledgeBaseRetriever({ knowledgeBaseId: 'TEST123456' });
    const results = await retriever.retrieve('no match');
    expect(results.results).toEqual([]);
  });
});
