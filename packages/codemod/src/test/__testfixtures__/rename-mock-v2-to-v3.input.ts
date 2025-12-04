// @ts-nocheck
import {
  MockEmbeddingModelV2,
  MockImageModelV2,
  MockLanguageModelV2,
  MockProviderV2,
  MockSpeechModelV2,
  MockTranscriptionModelV2,
} from 'ai/test';

// Using mock language model
const languageModel = new MockLanguageModelV2();

// Using mock embedding model
const embeddingModel = new MockEmbeddingModelV2();

// Using mock image model
const imageModel = new MockImageModelV2();

// Using mock provider
const provider = new MockProviderV2();

// Using mock speech model
const speechModel = new MockSpeechModelV2();

// Using mock transcription model
const transcriptionModel = new MockTranscriptionModelV2();

// Type annotations
function testWithModel(model: MockLanguageModelV2) {
  return model;
}

// Using as type parameter
const models: MockLanguageModelV2[] = [];

// Function that returns a mock
function createMock(): MockEmbeddingModelV2 {
  return new MockEmbeddingModelV2();
}

// In object type
interface TestConfig {
  model: MockLanguageModelV2;
  embedding: MockEmbeddingModelV2;
}

