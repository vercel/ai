import { NoSuchModelError } from '@ai-sdk/provider';
import { describe, expect, it, vi } from 'vitest';
import { createFishAudio } from './fish-audio-provider';
import { FishAudioSpeechModel } from './fish-audio-speech-model';
import { FishAudioTranscriptionModel } from './fish-audio-transcription-model';

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

describe('createFishAudio', () => {
  it('should create speech models', () => {
    const provider = createFishAudio({ apiKey: 'test-api-key' });

    expect(provider.speech('s1')).toBeInstanceOf(FishAudioSpeechModel);
    expect(provider.speechModel('s1')).toBeInstanceOf(FishAudioSpeechModel);
    expect(provider('s1').speech).toBeInstanceOf(FishAudioSpeechModel);
  });

  it('should create transcription models', () => {
    const provider = createFishAudio({ apiKey: 'test-api-key' });

    expect(provider.transcription()).toBeInstanceOf(
      FishAudioTranscriptionModel,
    );
    expect(provider.transcriptionModel('transcribe-1')).toBeInstanceOf(
      FishAudioTranscriptionModel,
    );
  });

  it('should default the transcription model id to `transcribe-1`', () => {
    const provider = createFishAudio({ apiKey: 'test-api-key' });

    expect(provider.transcription().modelId).toBe('transcribe-1');
  });

  it('should expose the speech model id and provider', () => {
    const provider = createFishAudio({ apiKey: 'test-api-key' });
    const model = provider.speech('s2-pro');

    expect(model.modelId).toBe('s2-pro');
    expect(model.provider).toBe('fish-audio.speech');
    expect(model.specificationVersion).toBe('v4');
  });

  it('should expose the transcription model provider', () => {
    const provider = createFishAudio({ apiKey: 'test-api-key' });
    const model = provider.transcription();

    expect(model.provider).toBe('fish-audio.transcription');
    expect(model.specificationVersion).toBe('v4');
  });

  it('should throw for unsupported model types', () => {
    const provider = createFishAudio({ apiKey: 'test-api-key' });

    expect(() => provider.languageModel('s1')).toThrow(NoSuchModelError);
    expect(() => provider.embeddingModel('s1')).toThrow(NoSuchModelError);
    expect(() => provider.imageModel('s1')).toThrow(NoSuchModelError);
  });

  it('should report specification version v4', () => {
    expect(
      createFishAudio({ apiKey: 'test-api-key' }).specificationVersion,
    ).toBe('v4');
  });
});
