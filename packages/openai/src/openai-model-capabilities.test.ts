import { describe, expect, expectTypeOf, it } from 'vitest';
import { openaiModelCapabilities } from './index';
import {
  getOpenAILanguageModelEntry,
  openaiModelCatalog,
} from './openai-model-catalog';

describe('openaiModelCapabilities', () => {
  it('preserves OpenAI endpoint and provider-option types', () => {
    const model = openaiModelCapabilities('gpt-5.4')!;

    expectTypeOf(model.endpoints.responses!.providerOptions).toHaveProperty(
      'previousResponseId',
    );
    expectTypeOf(model.endpoints.chat!.providerOptions).not.toHaveProperty(
      'previousResponseId',
    );
    expectTypeOf(model.endpoints).not.toHaveProperty('messages');
  });

  it('returns every declared language endpoint in one lookup', () => {
    const model = openaiModelCapabilities('gpt-5.6');

    expect(model).toMatchObject({ provider: 'openai', modelId: 'gpt-5.6' });
    expect(Object.keys(model!.endpoints)).toEqual(['responses', 'chat']);
    expect(model!.endpoints.responses!.capabilities.reasoning.efforts).toEqual([
      'none',
      'low',
      'medium',
      'high',
      'xhigh',
      'max',
    ]);
    expect(model!.endpoints.chat!.capabilities.reasoning.efforts).toEqual([
      'none',
      'low',
      'medium',
      'high',
      'xhigh',
    ]);
    expect(model!.endpoints.responses!.capabilities.tools.withReasoning).toBe(
      true,
    );
    expect(model!.endpoints.chat!.capabilities.tools.withReasoning).toBe(false);
  });

  it('uses the capability records stored in the catalog', () => {
    expect(
      openaiModelCapabilities('text-embedding-3-small')!.endpoints.embeddings!
        .capabilities,
    ).toEqual(
      openaiModelCatalog['text-embedding-3-small'].capabilities.embedding,
    );
  });

  it('declares endpoint-specific sampling and option support', () => {
    const { responses, chat } = openaiModelCapabilities('gpt-5.4')!.endpoints;

    expect(responses!.capabilities.sampling.logprobs).toBe('unknown');
    expect(chat!.capabilities.sampling.logprobs).toEqual({
      condition: 'Only when reasoning effort is none.',
    });
    expect(responses!.providerOptions.logprobs.support).toBe('unknown');
    expect(chat!.providerOptions.logprobs.support).toEqual(
      chat!.capabilities.sampling.logprobs,
    );
    expect(responses!.providerOptions.previousResponseId).toEqual({
      description: 'Previous response ID to continue.',
      support: true,
    });
    expect(chat!.providerOptions).not.toHaveProperty('previousResponseId');
    expect(chat!.providerOptions.logitBias.support).toBe(false);
    expect(chat!.providerOptions.prediction.support).toBe('unknown');
  });

  it('keeps Responses-only features out of Chat Completions', () => {
    const { responses, chat } =
      openaiModelCapabilities('gpt-6.1-sol')!.endpoints;

    expect(responses!.capabilities.configurationUpdates).toEqual({
      condition:
        'Requires standard reasoning mode without automatic compaction or automatic truncation.',
    });
    expect(responses!.providerOptions.reasoningEffortUpdate.support).toEqual(
      responses!.capabilities.configurationUpdates,
    );
    expect(responses!.capabilities.tools.async).toBe(true);
    expect(responses!.capabilities.sampling.logprobs).toBe(false);
    expect(chat!.capabilities.configurationUpdates).toBe(false);
    expect(chat!.capabilities.tools.async).toBe(false);
    expect(chat!.capabilities.reasoning.efforts).not.toContain('max');
  });

  it('does not declare tools with reasoning for non-reasoning models', () => {
    const { responses, chat } = openaiModelCapabilities('gpt-4.1')!.endpoints;

    expect(responses!.capabilities.tools.withReasoning).toBe(false);
    expect(chat!.capabilities.tools.withReasoning).toBe(false);
  });

  it.each(['gpt-5-pro', 'gpt-5.1-codex'])(
    'only returns declared endpoints for %s',
    modelId => {
      expect(Object.keys(openaiModelCapabilities(modelId)!.endpoints)).toEqual([
        'responses',
      ]);
    },
  );

  it('returns known snapshot IDs without inventing undeclared capabilities', () => {
    const model = openaiModelCapabilities('gpt-5.4-2026-03-05')!;

    expect(model.endpoints.responses!.capabilities.inputs.image).toBe(
      'unknown',
    );
    expect(model.endpoints.responses!.capabilities.objectGeneration).toBe(
      'unknown',
    );
    expect(model.endpoints.responses!.capabilities.reasoning.support).toBe(
      true,
    );
    expect(model.endpoints.chat).toBeDefined();
  });

  it('declares the search-preview temperature restriction for Chat Completions', () => {
    const { chat } = openaiModelCapabilities(
      'gpt-4o-search-preview',
    )!.endpoints;

    expect(chat!.capabilities.sampling.temperature).toBe(false);
    expect(chat!.capabilities.sampling.topP).toBe(true);
  });

  it('returns completion capabilities without declaring tools or structured output', () => {
    const model = openaiModelCapabilities('gpt-3.5-turbo-instruct')!;

    expect(Object.keys(model.endpoints)).toEqual(['completion']);
    expect(model.endpoints.completion).toMatchObject({
      operation: 'language',
      capabilities: {
        inputs: { image: false, audio: false },
        objectGeneration: false,
        tools: { usage: false, streaming: false },
        reasoning: { support: false },
      },
      providerOptions: { echo: { support: true } },
    });
  });

  it.each([
    ['text-embedding-3-small', 1536, true],
    ['text-embedding-3-large', 3072, true],
    ['text-embedding-ada-002', 1536, false],
  ])(
    'returns embedding dimensions for %s',
    (modelId, defaultDimensions, customDimensions) => {
      const model = openaiModelCapabilities(modelId)!;

      expect(Object.keys(model.endpoints)).toEqual(['embeddings']);
      expect(model.endpoints.embeddings).toMatchObject({
        operation: 'embedding',
        capabilities: { defaultDimensions, customDimensions },
        providerOptions: { dimensions: { support: customDimensions } },
      });
    },
  );

  it.each([
    'gpt-image-2.5-flare',
    'gpt-image-2.5-flare-2026-09-08',
    'chatgpt-image-latest',
  ])('resolves image capabilities for %s', modelId => {
    const model = openaiModelCapabilities(modelId)!;

    expect(Object.keys(model.endpoints)).toEqual(['images']);
    expect(model.endpoints.images).toMatchObject({
      operation: 'image',
      capabilities: { fileInput: true, maskInput: true, maxImagesPerCall: 10 },
      providerOptions: { quality: { support: 'unknown' } },
    });
  });

  it('returns declared transcription capabilities', () => {
    expect(
      openaiModelCapabilities('whisper-1')!.endpoints.transcription,
    ).toMatchObject({
      operation: 'transcription',
      capabilities: { transcription: true, streaming: false, segments: true },
    });
    expect(
      openaiModelCapabilities('gpt-live-transcribe')!.endpoints.transcription,
    ).toMatchObject({
      capabilities: {
        transcription: false,
        streaming: true,
        streamingDelay: true,
      },
    });
    expect(
      openaiModelCapabilities('gpt-4o-mini-transcribe-2025-03-20')!.endpoints
        .transcription!.capabilities.transcription,
    ).toBe('unknown');
  });

  it('preserves transcription option restrictions across REST and streaming', () => {
    const whisper =
      openaiModelCapabilities('whisper-1')!.endpoints.transcription!;
    const live = openaiModelCapabilities('gpt-live-transcribe')!.endpoints
      .transcription!;
    const transcribe =
      openaiModelCapabilities('gpt-transcribe')!.endpoints.transcription!;

    expect(whisper.providerOptions.streaming.support).toBe(false);
    expect(live.providerOptions.streaming.support).toBe(true);
    expect(live.providerOptions.prompt.support).toBe(false);
    expect(live.providerOptions.temperature.support).toBe(false);
    expect(live.providerOptions.language.support).toBe('unknown');
    expect(transcribe.providerOptions.streaming.support).toBe(true);
    expect(transcribe.providerOptions.prompt.support).toEqual({
      condition:
        'Only applies to non-streaming transcription; support depends on the selected option and model.',
    });
  });

  it('returns speech instruction support and undeclared snapshots', () => {
    expect(
      openaiModelCapabilities('tts-1')!.endpoints.speech!.capabilities
        .instructions,
    ).toBe(false);
    expect(
      openaiModelCapabilities('gpt-4o-mini-tts')!.endpoints.speech!
        .providerOptions.instructions.support,
    ).toBe(true);
    expect(
      openaiModelCapabilities('tts-1-1106')!.endpoints.speech!.capabilities
        .instructions,
    ).toBe('unknown');
  });

  it('returns translation and realtime endpoint capabilities', () => {
    expect(
      openaiModelCapabilities('gpt-realtime-translate')!.endpoints
        .speechTranslation,
    ).toMatchObject({
      operation: 'speechTranslation',
      capabilities: {
        translatedAudio: true,
        translatedText: true,
        sourceTranscript: true,
      },
    });
    expect(
      Object.keys(openaiModelCapabilities('gpt-live-1')!.endpoints),
    ).toEqual(['live']);
    expect(
      openaiModelCapabilities('gpt-realtime')!.endpoints.realtime,
    ).toMatchObject({
      operation: 'realtime',
      capabilities: { conversation: 'turn-based', transports: ['websocket'] },
    });
  });

  it('returns decisions alongside language endpoints for a model that supports both', () => {
    const model = openaiModelCapabilities('gpt-6-luna')!;

    expect(Object.keys(model.endpoints)).toEqual([
      'responses',
      'chat',
      'decisions',
    ]);
    expect(model.endpoints.decisions).toMatchObject({
      operation: 'decision',
      capabilities: {
        questionTypes: { boolean: true, choice: true, score: true, box: false },
        reasoning: false,
        maxOutputTokens: false,
      },
    });
  });

  it.each([
    'custom-model',
    'gpt-99',
    'ft:gpt-4o:org:custom:id',
    'toString',
    'constructor',
    '__proto__',
  ])('does not invent catalog data for %s', modelId => {
    expect(openaiModelCapabilities(modelId)).toBeUndefined();
  });

  it('excludes internal request policies from the public result', () => {
    const model = openaiModelCapabilities('gpt-5.4')!;

    expect(model).not.toHaveProperty('requestConfig');
    expect(model.endpoints.responses!.capabilities).not.toHaveProperty(
      'endpoints',
    );
    expect(
      model.endpoints.responses!.capabilities.reasoning,
    ).not.toHaveProperty('sampling');
    expect(model.endpoints.responses).not.toHaveProperty('requestConfig');
  });

  it('isolates caller mutations from request behavior and other endpoints', () => {
    const model = openaiModelCapabilities('gpt-5.6')!;
    const responses = model.endpoints.responses!;
    (responses.capabilities.inputs as { image: boolean }).image = false;
    (responses.capabilities.reasoning.efforts as string[]).push('custom');

    expect(model.endpoints.chat!.capabilities.inputs.image).toBe(true);
    expect(model.endpoints.chat!.capabilities.reasoning.efforts).not.toContain(
      'custom',
    );
    expect(
      openaiModelCapabilities('gpt-5.6')!.endpoints.responses!.capabilities
        .inputs.image,
    ).toBe(true);
    expect(
      getOpenAILanguageModelEntry('gpt-5.6').capabilities.language.inputs.image,
    ).toBe(true);
    expect(
      getOpenAILanguageModelEntry('gpt-5.6').capabilities.language.reasoning
        .efforts,
    ).not.toContain('custom');
  });
});
