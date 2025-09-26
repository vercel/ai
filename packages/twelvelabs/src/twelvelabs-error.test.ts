import { describe, it, expect } from 'vitest';
import { TwelveLabsError, mapTwelveLabsError } from './twelvelabs-error';

describe('TwelveLabsError', () => {
  it('should create an error with message and status code', () => {
    const error = new TwelveLabsError({
      message: 'Test error',
      statusCode: 400,
    });

    expect(error.message).toBe('Test error');
    expect(error.statusCode).toBe(400);
    expect(error.isRetryable).toBe(false);
  });

  it('should mark 429 errors as retryable', () => {
    const error = new TwelveLabsError({
      message: 'Rate limit exceeded',
      statusCode: 429,
    });

    expect(error.isRetryable).toBe(true);
  });

  it('should mark 503 errors as retryable', () => {
    const error = new TwelveLabsError({
      message: 'Service unavailable',
      statusCode: 503,
    });

    expect(error.isRetryable).toBe(true);
  });
});

describe('mapTwelveLabsError', () => {
  it('should map API key invalid errors', () => {
    const error = mapTwelveLabsError({ message: 'api_key_invalid' });

    expect(error).toBeInstanceOf(TwelveLabsError);
    expect(error.message).toBe('Invalid Twelve Labs API key');
    expect((error as TwelveLabsError).statusCode).toBe(401);
  });

  it('should map rate limit errors', () => {
    const error = mapTwelveLabsError({
      message: 'rate limit exceeded',
      status: 429,
    });

    expect(error).toBeInstanceOf(TwelveLabsError);
    expect(error.message).toBe('Twelve Labs rate limit exceeded');
    expect((error as TwelveLabsError).statusCode).toBe(429);
  });

  it('should map service unavailable errors', () => {
    const error = mapTwelveLabsError({
      message: 'service temporarily unavailable',
      statusCode: 503,
    });

    expect(error).toBeInstanceOf(TwelveLabsError);
    expect(error.message).toBe('Twelve Labs service temporarily unavailable');
    expect((error as TwelveLabsError).statusCode).toBe(503);
  });

  it('should map not found errors', () => {
    const error = mapTwelveLabsError({
      message: 'video not found',
      status: 404,
    });

    expect(error).toBeInstanceOf(TwelveLabsError);
    expect(error.message).toBe('Resource not found: video not found');
    expect((error as TwelveLabsError).statusCode).toBe(404);
  });

  it('should map parameter errors', () => {
    const error = mapTwelveLabsError({
      message: 'invalid parameter: modelId',
      status: 400,
    });

    expect(error).toBeInstanceOf(TwelveLabsError);
    expect(error.message).toBe('Invalid parameter: invalid parameter: modelId');
    expect((error as TwelveLabsError).statusCode).toBe(400);
  });

  it('should map video processing errors', () => {
    const error = mapTwelveLabsError({ message: 'video upload failed' });

    expect(error).toBeInstanceOf(TwelveLabsError);
    expect(error.message).toBe('Video processing error: video upload failed');
    expect((error as TwelveLabsError).statusCode).toBe(400);
  });

  it('should map generic errors', () => {
    const error = mapTwelveLabsError({ message: 'Something went wrong' });

    expect(error).toBeInstanceOf(TwelveLabsError);
    expect(error.message).toBe('Something went wrong');
    expect((error as TwelveLabsError).statusCode).toBe(500);
  });

  it('should handle errors without message', () => {
    const error = mapTwelveLabsError(null);

    expect(error).toBeInstanceOf(TwelveLabsError);
    expect(error.message).toBe('null');
    expect((error as TwelveLabsError).statusCode).toBe(500);
  });
});
