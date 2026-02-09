import { describe, it, expect } from 'vitest';
import { detectApiFormat } from './azure-ai-foundry-routing';

describe('detectApiFormat', () => {
  // ── Anthropic by name prefix/exact match ──────────────────────────────

  it("returns 'anthropic' for 'claude-sonnet-4-5' (claude- prefix)", () => {
    expect(detectApiFormat('claude-sonnet-4-5')).toBe('anthropic');
  });

  it("returns 'anthropic' for 'claude-opus-4-1' (claude- prefix)", () => {
    expect(detectApiFormat('claude-opus-4-1')).toBe('anthropic');
  });

  it("returns 'anthropic' for 'CLAUDE-opus-4-5' (case-insensitive prefix)", () => {
    expect(detectApiFormat('CLAUDE-opus-4-5')).toBe('anthropic');
  });

  it("returns 'anthropic' for 'claude_sonnet' (claude_ prefix)", () => {
    expect(detectApiFormat('claude_sonnet')).toBe('anthropic');
  });

  it("returns 'anthropic' for 'Claude_Opus' (case-insensitive claude_ prefix)", () => {
    expect(detectApiFormat('Claude_Opus')).toBe('anthropic');
  });

  it("returns 'anthropic' for exact 'claude'", () => {
    expect(detectApiFormat('claude')).toBe('anthropic');
  });

  it("returns 'anthropic' for 'CLAUDE' (case-insensitive exact match)", () => {
    expect(detectApiFormat('CLAUDE')).toBe('anthropic');
  });

  it("returns 'anthropic' for 'Claude' (mixed-case exact match)", () => {
    expect(detectApiFormat('Claude')).toBe('anthropic');
  });

  // ── OpenAI by default ─────────────────────────────────────────────────

  it("returns 'openai' for 'gpt-4o' (non-Claude deployment)", () => {
    expect(detectApiFormat('gpt-4o')).toBe('openai');
  });

  it("returns 'openai' for 'o3-mini'", () => {
    expect(detectApiFormat('o3-mini')).toBe('openai');
  });

  it("returns 'openai' for 'my-custom-deployment'", () => {
    expect(detectApiFormat('my-custom-deployment')).toBe('openai');
  });

  it("returns 'openai' for empty string", () => {
    expect(detectApiFormat('')).toBe('openai');
  });

  // ── Edge cases: names containing 'claude' but not matching patterns ───

  it("returns 'openai' for 'not-claude' (claude not at start)", () => {
    expect(detectApiFormat('not-claude')).toBe('openai');
  });

  it("returns 'openai' for 'claudex' (no separator after claude)", () => {
    expect(detectApiFormat('claudex')).toBe('openai');
  });

  it("returns 'openai' for 'claude3' (no separator after claude)", () => {
    expect(detectApiFormat('claude3')).toBe('openai');
  });

  it("returns 'openai' for 'my-claude-model' (claude not at start)", () => {
    expect(detectApiFormat('my-claude-model')).toBe('openai');
  });

  it("returns 'openai' for 'claude.' (dot separator, not - or _)", () => {
    expect(detectApiFormat('claude.')).toBe('openai');
  });

  // ── anthropicDeployments list takes priority ──────────────────────────

  it("returns 'anthropic' when deployment is in anthropicDeployments list", () => {
    expect(
      detectApiFormat('my-custom-anthropic', ['my-custom-anthropic']),
    ).toBe('anthropic');
  });

  it("returns 'anthropic' for non-Claude name in anthropicDeployments list", () => {
    expect(detectApiFormat('gpt-4o', ['gpt-4o'])).toBe('anthropic');
  });

  it('anthropicDeployments match is case-sensitive', () => {
    // 'Claude-Sonnet' is in the list but 'claude-sonnet' is not;
    // however, the name-based fallback will still match it via toLowerCase()
    expect(detectApiFormat('claude-sonnet', ['Claude-Sonnet'])).toBe(
      'anthropic',
    );
    // A truly non-Claude name that only differs by case won't match
    expect(detectApiFormat('MyModel', ['mymodel'])).toBe('openai');
  });

  it("returns 'openai' when deployment is NOT in anthropicDeployments and has no Claude prefix", () => {
    expect(
      detectApiFormat('gpt-4o', ['claude-sonnet-4-5', 'my-anthropic']),
    ).toBe('openai');
  });

  // ── anthropicDeployments undefined / empty ────────────────────────────

  it('falls through to name detection when anthropicDeployments is undefined', () => {
    expect(detectApiFormat('claude-haiku', undefined)).toBe('anthropic');
    expect(detectApiFormat('gpt-4o', undefined)).toBe('openai');
  });

  it('falls through to name detection when anthropicDeployments is empty array', () => {
    expect(detectApiFormat('claude-haiku', [])).toBe('anthropic');
    expect(detectApiFormat('gpt-4o', [])).toBe('openai');
  });
});
