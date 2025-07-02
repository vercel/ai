// @ts-nocheck
// Basic usage
import { LangChainAdapter } from 'ai';
const response = LangChainAdapter.toDataStreamResponse(stream);

// Alias import
import { LangChainAdapter as Adapter } from 'ai';
const response2 = Adapter.toDataStreamResponse(stream2);

// Multiple imports, LangChainAdapter first
import { LangChainAdapter, SomethingElse } from 'ai';
const response3 = LangChainAdapter.toDataStreamResponse(stream3);

// Multiple imports, LangChainAdapter last
import { SomethingElse, LangChainAdapter } from 'ai';
const response4 = LangChainAdapter.toDataStreamResponse(stream4);

// Unused LangChainAdapter import
import { LangChainAdapter } from 'ai';

// Import from not-ai (should not transform)
import { LangChainAdapter } from 'not-ai';
const response5 = LangChainAdapter.toDataStreamResponse(stream5);

// Already migrated code (should not transform)
import { toDataStreamResponse } from '@ai-sdk/langchain';
const response6 = toDataStreamResponse(stream6);

// Destructured require (should not transform)
const { LangChainAdapter } = require('ai');
const response7 = LangChainAdapter.toDataStreamResponse(stream7);
