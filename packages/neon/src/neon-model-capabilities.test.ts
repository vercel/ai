import { describe, expect, it } from 'vitest';
import {
  getNeonModelCapabilities,
  getNeonModelRoute,
} from './neon-model-capabilities';

describe('getNeonModelRoute', () => {
  it('routes Anthropic and OpenAI models to their native endpoints', () => {
    expect(getNeonModelRoute('databricks-claude-opus-4-8')).toBe('anthropic');
    expect(getNeonModelRoute('databricks-claude-haiku-4-5')).toBe('anthropic');
    expect(getNeonModelRoute('databricks-gpt-5')).toBe('openai');
    expect(getNeonModelRoute('databricks-gpt-5-mini')).toBe('openai');
    expect(getNeonModelRoute('databricks-gpt-5-3-codex')).toBe('openai');
  });

  it('falls back to the unified MLflow endpoint for everything else', () => {
    // Gemini is routed to MLflow because its native endpoint cannot stream.
    expect(getNeonModelRoute('databricks-gemini-2-5-flash')).toBe('mlflow');
    expect(getNeonModelRoute('databricks-gemini-3-5-flash')).toBe('mlflow');
    expect(getNeonModelRoute('databricks-llama-4-maverick')).toBe('mlflow');
    expect(getNeonModelRoute('databricks-meta-llama-3-3-70b-instruct')).toBe(
      'mlflow',
    );
    expect(getNeonModelRoute('databricks-qwen35-122b-a10b')).toBe('mlflow');
    expect(getNeonModelRoute('databricks-gemma-3-12b')).toBe('mlflow');
    // gpt-oss is open-weight and served on the unified endpoint, not Responses
    expect(getNeonModelRoute('databricks-gpt-oss-120b')).toBe('mlflow');
  });
});

describe('getNeonModelCapabilities', () => {
  it('marks Anthropic models correctly', () => {
    const caps = getNeonModelCapabilities('databricks-claude-haiku-4-5');
    expect(caps.family).toBe('anthropic');
    expect(caps.supportsPenalties).toBe(false);
    expect(caps.supportsSeed).toBe(false);
    expect(caps.temperatureTopPMutuallyExclusive).toBe(true);
    expect(caps.supportsReasoningEffort).toBe(false);
  });

  it('marks plain GPT-5 reasoning models without temperature/topP support', () => {
    const caps = getNeonModelCapabilities('databricks-gpt-5-mini');
    expect(caps.family).toBe('openai');
    expect(caps.supportsTemperature).toBe(false);
    expect(caps.supportsTopP).toBe(false);
    // penalties/seed/stop are stripped by the native Responses model, so we
    // leave them permissive here to avoid duplicate handling.
    expect(caps.supportsPenalties).toBe(true);
  });

  it('keeps temperature for gpt-5.1+ models', () => {
    const caps = getNeonModelCapabilities('databricks-gpt-5-1');
    expect(caps.supportsTemperature).toBe(true);
    expect(caps.supportsTopP).toBe(true);
  });

  it('marks Meta models without penalties/seed support', () => {
    const caps = getNeonModelCapabilities('databricks-llama-4-maverick');
    expect(caps.family).toBe('meta');
    expect(caps.supportsPenalties).toBe(false);
    expect(caps.supportsSeed).toBe(false);
    expect(caps.supportsStopSequences).toBe(true);
  });

  it('is permissive for unknown models', () => {
    const caps = getNeonModelCapabilities('databricks-qwen35-122b-a10b');
    expect(caps.family).toBe('other');
    expect(caps.supportsPenalties).toBe(true);
    expect(caps.supportsSeed).toBe(true);
    expect(caps.supportsReasoningEffort).toBe(true);
  });
});
