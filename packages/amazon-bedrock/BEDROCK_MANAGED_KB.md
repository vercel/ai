# Bedrock Managed Knowledge Base Support

## Overview
Adds a Vercel AI SDK tool for querying Amazon Bedrock Knowledge Bases with managed retrieval in TypeScript/JavaScript applications.

## Usage
```typescript
import { generateText } from 'ai';
import { bedrock } from '@ai-sdk/amazon-bedrock';
import { bedrockKnowledgeBase } from '@ai-sdk/amazon-bedrock/kb';

const result = await generateText({
  model: bedrock('anthropic.claude-sonnet-4-20250514-v1:0'),
  tools: { kb: bedrockKnowledgeBase({ knowledgeBaseId: 'YOUR_KB_ID' }) },
  prompt: 'What does our documentation say about rate limits?',
});
```

## Configuration
| Variable | Description | Default |
|---|---|---|
| KNOWLEDGE_BASE_ID | Bedrock Knowledge Base ID | None |
| AWS_REGION | AWS region for the KB | us-east-1 |
| AWS_ACCESS_KEY_ID | AWS access key | None |
| AWS_SECRET_ACCESS_KEY | AWS secret key | None |
| USE_AGENTIC_RETRIEVAL | Enable agentic retrieval | true |

## Features
- Managed search (no vector store needed)
- Agentic retrieval with query decomposition + reranking
- Automatic fallback to plain Retrieve if agentic fails
- Multi-source support (S3, Web, Confluence, SharePoint)
- Native AI SDK tool interface with streaming support

## SDK Requirements
- @aws-sdk/client-bedrock-agent-runtime >= 3.700
- ai >= 4.0
- @ai-sdk/amazon-bedrock >= 2.0

## Reranking Options
For managed search, these reranking modes are available:
- `MANAGED` (default) — automatic reranking by Bedrock
- `NONE` — disable reranking
- `CUSTOM` — your own Bedrock reranking model (e.g., Cohere Rerank v3.5)

## References
- [Build a Managed Knowledge Base](https://docs.aws.amazon.com/bedrock/latest/userguide/kb-build-managed.html)
- [Retrieve API](https://docs.aws.amazon.com/bedrock/latest/userguide/kb-test-retrieve.html)
- [Agentic Retrieval](https://docs.aws.amazon.com/bedrock/latest/userguide/kb-test-agentic.html)
