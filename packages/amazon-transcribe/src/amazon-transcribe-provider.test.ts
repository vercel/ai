import { NoSuchModelError } from '@ai-sdk/provider';
import { describe, expect, it } from 'vitest';
import { createAmazonTranscribe } from './amazon-transcribe-provider';
import { AmazonTranscribeTranscriptionModel } from './amazon-transcribe-transcription-model';

const provider = createAmazonTranscribe({
  region: 'us-east-1',
  accessKeyId: 'test-access-key-id',
  secretAccessKey: 'test-secret-access-key',
});

describe('createAmazonTranscribe', () => {
  it('creates a transcription model via the factory method', () => {
    const model = provider.transcription();
    expect(model).toBeInstanceOf(AmazonTranscribeTranscriptionModel);
    expect(model.modelId).toBe('default');
    expect(model.provider).toBe('amazon-transcribe.transcription');
  });

  it('creates a transcription model when called directly', () => {
    const model = provider('default');
    expect(model).toBeInstanceOf(AmazonTranscribeTranscriptionModel);
  });

  it('passes a custom model id through as the model id', () => {
    const model = provider.transcriptionModel('my-custom-language-model');
    expect(model.modelId).toBe('my-custom-language-model');
  });

  it('throws when constructed with the new keyword', () => {
    expect(() => {
      // @ts-expect-error - testing runtime guard
      new provider('default');
    }).toThrow();
  });

  it('throws NoSuchModelError for unsupported model types', () => {
    expect(() => provider.languageModel('x')).toThrow(NoSuchModelError);
    expect(() => provider.imageModel('x')).toThrow(NoSuchModelError);
    expect(() => provider.embeddingModel('x')).toThrow(NoSuchModelError);
  });
});
