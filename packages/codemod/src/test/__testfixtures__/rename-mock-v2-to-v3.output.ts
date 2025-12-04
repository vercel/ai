// @ts-nocheck
import {
  MockEmbeddingModelV3,
  MockImageModelV3,
  MockLanguageModelV3,
  MockProviderV3,
  MockSpeechModelV3,
  MockTranscriptionModelV3,
} from 'ai/test';

// Using mock language model
const languageModel = new MockLanguageModelV3();

// Using mock embedding model
const embeddingModel = new MockEmbeddingModelV3();

// Using mock image model
const imageModel = new MockImageModelV3();

// Using mock provider
const provider = new MockProviderV3();

// Using mock speech model
const speechModel = new MockSpeechModelV3();

// Using mock transcription model
const transcriptionModel = new MockTranscriptionModelV3();

// Type annotations
function testWithModel(model: MockLanguageModelV3) {
  return model;
}

// Using as type parameter
const models: MockLanguageModelV3[] = [];

// Function that returns a mock
function createMock(): MockEmbeddingModelV3 {
  return new MockEmbeddingModelV3();
}

// In object type
interface TestConfig {
  model: MockLanguageModelV3;
  embedding: MockEmbeddingModelV3;
}

