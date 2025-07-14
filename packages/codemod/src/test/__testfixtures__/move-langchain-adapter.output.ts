// @ts-nocheck
// Basic usage
import { toDataStreamResponse } from '@ai-sdk/langchain';
const response = toDataStreamResponse(stream);

// Alias import
import { toDataStreamResponse as Adapter } from '@ai-sdk/langchain';
const response2 = Adapter(stream2);

// Multiple imports, LangChainAdapter first
import { toDataStreamResponse, SomethingElse } from '@ai-sdk/langchain';
const response3 = toDataStreamResponse(stream3);

// Multiple imports, LangChainAdapter last
import { SomethingElse, toDataStreamResponse } from '@ai-sdk/langchain';
const response4 = toDataStreamResponse(stream4);

// Unused LangChainAdapter import
import { toDataStreamResponse } from '@ai-sdk/langchain';

// Import from not-ai (should not transform)
import { LangChainAdapter } from 'not-ai';
const response5 = LangChainAdapter.toDataStreamResponse(stream5);

// Already migrated code (should not transform)
import { toDataStreamResponse } from '@ai-sdk/langchain';
const response6 = toDataStreamResponse(stream6);

// Destructured require (should not transform)
const { LangChainAdapter } = require('ai');
const response7 = LangChainAdapter.toDataStreamResponse(stream7);
