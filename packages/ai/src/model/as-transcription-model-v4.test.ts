import type { TranscriptionModelV4 } from '@ai-sdk/provider';
import { describe, expect, it, vi } from 'vitest';
import { MockTranscriptionModelV2 } from '../test/mock-transcription-model-v2';
import { MockTranscriptionModelV3 } from '../test/mock-transcription-model-v3';
import { MockTranscriptionModelV4 } from '../test/mock-transcription-model-v4';
import { asTranscriptionModelV4 } from './as-transcription-model-v4';

describe('asTranscriptionModelV4', () => {
  describe('when a transcription model v4 is provided', () => {
    it('should return the same v4 model unchanged', () => {
      const originalModel = new MockTranscriptionModelV4({
        provider: 'test-provider',
        modelId: 'test-model-id',
      });

      const result = asTranscriptionModelV4(originalModel);

      expect(result).toBe(originalModel);
      expect(result.specificationVersion).toBe('v4');
    });

    it('should preserve all v4 model properties', () => {
      const originalModel = new MockTranscriptionModelV4({
        provider: 'test-provider-v4',
        modelId: 'test-model-v4',
      });

      const result = asTranscriptionModelV4(originalModel);

      expect(result.provider).toBe('test-provider-v4');
      expect(result.modelId).toBe('test-model-v4');
    });
  });

  describe('when a transcription model v3 is provided', () => {
    it('should convert v3 to v4 and change specificationVersion', () => {
      const v3Model = new MockTranscriptionModelV3({
        provider: 'test-provider',
        modelId: 'test-model-id',
      });

      const result = asTranscriptionModelV4(v3Model);

      expect(result.specificationVersion).toBe('v4');
      expect(result).not.toBe(v3Model);
    });

    it('should preserve provider property', () => {
      const v3Model = new MockTranscriptionModelV3({
        provider: 'test-provider-v3',
        modelId: 'test-model-id',
      });

      const result = asTranscriptionModelV4(v3Model);

      expect(result.provider).toBe('test-provider-v3');
    });

    it('should preserve modelId property', () => {
      const v3Model = new MockTranscriptionModelV3({
        provider: 'test-provider',
        modelId: 'test-model-v3',
      });

      const result = asTranscriptionModelV4(v3Model);

      expect(result.modelId).toBe('test-model-v3');
    });

    it('should make doGenerate method callable', async () => {
      const v3Model = new MockTranscriptionModelV3({
        provider: 'test-provider',
        modelId: 'test-model-id',
        doGenerate: async () => ({
          text: 'Hello, world!',
          segments: [
            {
              text: 'Hello, world!',
              startSecond: 0,
              endSecond: 2.5,
            },
          ],
          language: 'en',
          durationInSeconds: 2.5,
          warnings: [],
          response: {
            timestamp: new Date(),
            modelId: 'test-model',
            headers: undefined,
          },
        }),
      });

      const result = asTranscriptionModelV4(v3Model);

      const response = await result.doGenerate({
        audio: new Uint8Array([1, 2, 3]),
        mediaType: 'audio/wav',
      });

      expect(response.text).toBe('Hello, world!');
      expect(response.segments).toHaveLength(1);
    });
  });

  describe('when a transcription model v2 is provided', () => {
    it('should convert v2 through v3 to v4', () => {
      const v2Model = new MockTranscriptionModelV2({
        provider: 'test-provider',
        modelId: 'test-model-id',
      });

      const result = asTranscriptionModelV4(v2Model);

      expect(result.specificationVersion).toBe('v4');
      expect(result.provider).toBe('test-provider');
      expect(result.modelId).toBe('test-model-id');
    });
  });

  describe.each([
    ['v2', MockTranscriptionModelV2],
    ['v3', MockTranscriptionModelV3],
  ] as const)('shared timestamp compatibility for %s', (version, MockModel) => {
    const response = {
      text: 'Hello, world!',
      segments: [{ text: 'Hello, world!', startSecond: 0, endSecond: 1 }],
      language: 'en',
      durationInSeconds: 1,
      warnings: [{ type: 'other' as const, message: 'Provider warning' }],
      response: { timestamp: new Date(0), modelId: 'test-model' },
      providerMetadata: { test: { value: true } },
    };

    it('should warn for shared timing requests and preserve provider options and results', async () => {
      const doGenerate = vi.fn(async () => response);
      const model = new MockModel({ doGenerate });
      const {
        timestampGranularities,
        ...legacyOptions
      }: Parameters<TranscriptionModelV4['doGenerate']>[0] = {
        audio: new Uint8Array([1, 2, 3]),
        mediaType: 'audio/wav',
        timestampGranularities: ['word', 'segment'],
        providerOptions: { test: { timestampGranularities: ['word'] } },
        headers: { 'test-header': 'value' },
        abortSignal: new AbortController().signal,
      };

      const result = await asTranscriptionModelV4(model).doGenerate({
        ...legacyOptions,
        timestampGranularities,
      });

      expect(doGenerate).toHaveBeenCalledExactlyOnceWith(legacyOptions);
      expect(doGenerate.mock.contexts[0]).toBe(model);
      expect(result).toEqual({
        ...response,
        warnings: [
          ...response.warnings,
          {
            type: 'unsupported',
            feature: 'timestampGranularities',
            details: expect.stringContaining(version),
          },
        ],
      });
      expect(response.warnings).toEqual([
        { type: 'other', message: 'Provider warning' },
      ]);
      expect(result.words).toBeUndefined();
    });

    it.each([
      { timestampGranularities: undefined },
      { timestampGranularities: [] },
    ])(
      'should not warn for timestampGranularities $timestampGranularities',
      async ({ timestampGranularities }) => {
        const doGenerate = vi.fn(async () => response);
        const result = await asTranscriptionModelV4(
          new MockModel({ doGenerate }),
        ).doGenerate({
          audio: new Uint8Array([1, 2, 3]),
          mediaType: 'audio/wav',
          timestampGranularities,
        });

        expect(result).toBe(response);
        expect(result.warnings).toEqual(response.warnings);
        expect(doGenerate).toHaveBeenCalledExactlyOnceWith({
          audio: new Uint8Array([1, 2, 3]),
          mediaType: 'audio/wav',
        });
      },
    );

    it('should bind doGenerate to the original model with private state', async () => {
      class LegacyModel {
        readonly specificationVersion = version;
        readonly provider = 'test-provider';
        readonly modelId = 'test-model';
        #text = 'Private state transcript';

        async doGenerate() {
          return { ...response, text: this.#text };
        }
      }

      const model = asTranscriptionModelV4(new LegacyModel());
      const doGenerate = model.doGenerate;
      const result = await doGenerate({
        audio: new Uint8Array([1, 2, 3]),
        mediaType: 'audio/wav',
        timestampGranularities: ['word'],
      });

      expect(result.text).toBe('Private state transcript');
    });
  });
});
