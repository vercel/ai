# AI SDK - VectorStores Adapter

This package provides VectorStores integration for the AI SDK, enabling easy use of vector stores for Retrieval-Augmented Generation (RAG) with any AI SDK compatible model.

## Installation

```bash
npm install @ai-sdk/vectorstores @vectorstores/core
```

## Features

- **`vectorstores`** - A tool that queries a VectorStoreIndex and returns relevant documents
- **`vercelEmbedding`** - An adapter to use AI SDK embedding models with VectorStores

## Usage

```typescript
import { openai } from '@ai-sdk/openai';
import { Document, VectorStoreIndex } from '@vectorstores/core';
import { streamText } from 'ai';
import { vectorstores, vercelEmbedding } from '@ai-sdk/vectorstores';

// Create a document
const document = new Document({
  text: 'Your document content...',
  id_: 'doc1',
});

// Create an index using AI SDK embeddings
const index = await VectorStoreIndex.fromDocuments([document], {
  embedFunc: vercelEmbedding(openai.embedding('text-embedding-3-small')),
});

// Use the vectorstores tool with streamText
const result = streamText({
  model: openai('gpt-4o'),
  prompt: 'What is the main topic of the document?',
  tools: {
    queryKnowledge: vectorstores({ index }),
  },
});

for await (const textPart of result.textStream) {
  process.stdout.write(textPart);
}
```

## API Reference

### `vectorstores(options)`

Creates a tool for querying a VectorStoreIndex.

**Parameters:**

- `index` - The VectorStoreIndex to query
- `description` - Optional custom description for the tool
- `similarityTopK` - Number of top results to retrieve (default: 10)

### `vercelEmbedding(model, options?)`

Creates an embedding function compatible with VectorStores from an AI SDK embedding model.

**Parameters:**

- `model` - The AI SDK embedding model
- `options.maxRetries` - Maximum number of retries (default: 2)
- `options.headers` - Additional headers for the request

## Documentation

For more information, see the [AI SDK documentation](https://ai-sdk.dev/docs).
