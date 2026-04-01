import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  createRealtimeToolToken,
  verifyRealtimeToolToken,
} from './realtime-tool-token';

const TEST_SECRET = 'test-secret-that-is-long-enough-for-validation';

describe('createRealtimeToolToken', () => {
  it('should create a token string with two dot-separated parts', async () => {
    const token = await createRealtimeToolToken({
      tools: ['getWeather', 'rollDice'],
      secret: TEST_SECRET,
    });

    expect(typeof token).toBe('string');
    const parts = token.split('.');
    expect(parts.length).toBe(2);
    expect(parts[0].length).toBeGreaterThan(0);
    expect(parts[1].length).toBeGreaterThan(0);
  });

  it('should throw if secret is too short', async () => {
    await expect(
      createRealtimeToolToken({ tools: ['getWeather'], secret: 'short' }),
    ).rejects.toThrow('Secret must be at least 16 characters');
  });

  it('should throw if secret is empty', async () => {
    await expect(
      createRealtimeToolToken({ tools: ['getWeather'], secret: '' }),
    ).rejects.toThrow('Secret must be at least 16 characters');
  });
});

describe('verifyRealtimeToolToken', () => {
  it('should verify a valid token with authorized tools', async () => {
    const token = await createRealtimeToolToken({
      tools: ['getWeather', 'rollDice'],
      secret: TEST_SECRET,
    });

    const result = await verifyRealtimeToolToken({
      token,
      secret: TEST_SECRET,
      toolNames: ['getWeather'],
    });

    expect(result).toEqual({ valid: true });
  });

  it('should verify when requesting all authorized tools', async () => {
    const token = await createRealtimeToolToken({
      tools: ['getWeather', 'rollDice'],
      secret: TEST_SECRET,
    });

    const result = await verifyRealtimeToolToken({
      token,
      secret: TEST_SECRET,
      toolNames: ['getWeather', 'rollDice'],
    });

    expect(result).toEqual({ valid: true });
  });

  it('should reject an unauthorized tool name', async () => {
    const token = await createRealtimeToolToken({
      tools: ['getWeather'],
      secret: TEST_SECRET,
    });

    const result = await verifyRealtimeToolToken({
      token,
      secret: TEST_SECRET,
      toolNames: ['deleteDatabase'],
    });

    expect(result).toEqual({
      valid: false,
      error: 'Unauthorized tool(s): deleteDatabase',
    });
  });

  it('should reject a mix of authorized and unauthorized tools', async () => {
    const token = await createRealtimeToolToken({
      tools: ['getWeather'],
      secret: TEST_SECRET,
    });

    const result = await verifyRealtimeToolToken({
      token,
      secret: TEST_SECRET,
      toolNames: ['getWeather', 'deleteDatabase'],
    });

    expect(result).toEqual({
      valid: false,
      error: 'Unauthorized tool(s): deleteDatabase',
    });
  });

  it('should reject a token signed with a different secret', async () => {
    const token = await createRealtimeToolToken({
      tools: ['getWeather'],
      secret: TEST_SECRET,
    });

    const result = await verifyRealtimeToolToken({
      token,
      secret: 'a-completely-different-secret-value',
      toolNames: ['getWeather'],
    });

    expect(result).toEqual({ valid: false, error: 'Invalid token signature' });
  });

  it('should reject an expired token', async () => {
    // Create a token that expires immediately
    vi.useFakeTimers();
    const now = Date.now();
    vi.setSystemTime(now);

    const token = await createRealtimeToolToken({
      tools: ['getWeather'],
      secret: TEST_SECRET,
      maxAgeSeconds: 60,
    });

    // Advance time past expiry
    vi.setSystemTime(now + 61_000);

    const result = await verifyRealtimeToolToken({
      token,
      secret: TEST_SECRET,
      toolNames: ['getWeather'],
    });

    expect(result).toEqual({ valid: false, error: 'Token expired' });
    vi.useRealTimers();
  });

  it('should accept a token that has not yet expired', async () => {
    vi.useFakeTimers();
    const now = Date.now();
    vi.setSystemTime(now);

    const token = await createRealtimeToolToken({
      tools: ['getWeather'],
      secret: TEST_SECRET,
      maxAgeSeconds: 600,
    });

    // Advance time but stay within expiry
    vi.setSystemTime(now + 300_000);

    const result = await verifyRealtimeToolToken({
      token,
      secret: TEST_SECRET,
      toolNames: ['getWeather'],
    });

    expect(result).toEqual({ valid: true });
    vi.useRealTimers();
  });

  it('should reject an empty token', async () => {
    const result = await verifyRealtimeToolToken({
      token: '',
      secret: TEST_SECRET,
      toolNames: ['getWeather'],
    });

    expect(result).toEqual({
      valid: false,
      error: 'Missing tool authorization token',
    });
  });

  it('should reject a malformed token without separator', async () => {
    const result = await verifyRealtimeToolToken({
      token: 'noseparatorhere',
      secret: TEST_SECRET,
      toolNames: ['getWeather'],
    });

    expect(result).toEqual({ valid: false, error: 'Malformed token' });
  });

  it('should reject a tampered payload', async () => {
    const token = await createRealtimeToolToken({
      tools: ['getWeather'],
      secret: TEST_SECRET,
    });

    // Tamper with the payload part (swap a character)
    const parts = token.split('.');
    const tamperedPayload =
      parts[0].slice(0, -1) + (parts[0].slice(-1) === 'A' ? 'B' : 'A');
    const tamperedToken = `${tamperedPayload}.${parts[1]}`;

    const result = await verifyRealtimeToolToken({
      token: tamperedToken,
      secret: TEST_SECRET,
      toolNames: ['getWeather'],
    });

    expect(result).toEqual({ valid: false, error: 'Invalid token signature' });
  });

  it('should handle tool order independence', async () => {
    // Token created with tools in one order
    const token = await createRealtimeToolToken({
      tools: ['rollDice', 'getWeather'],
      secret: TEST_SECRET,
    });

    // Verify with tools requested in different order
    const result = await verifyRealtimeToolToken({
      token,
      secret: TEST_SECRET,
      toolNames: ['getWeather', 'rollDice'],
    });

    expect(result).toEqual({ valid: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });
});
