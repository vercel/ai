import { describe, it, expect, vi } from 'vitest';
import { devToolsMiddleware } from './middleware.js';
import * as db from './db.js';

// Mock the database functions
vi.mock('./db.js', () => ({
  createRun: vi.fn().mockResolvedValue(undefined),
  createStep: vi.fn().mockResolvedValue(undefined),
  updateStepResult: vi.fn().mockResolvedValue(undefined),
  notifyServerAsync: vi.fn().mockResolvedValue(undefined),
}));

describe('devToolsMiddleware', () => {
  it('should create middleware with auto-generated runId when no options provided', () => {
    const middleware = devToolsMiddleware();

    expect(middleware.specificationVersion).toBe('v3');
    expect(middleware.wrapGenerate).toBeDefined();
    expect(middleware.wrapStream).toBeDefined();
  });

  it('should create middleware with custom runId', () => {
    const middleware = devToolsMiddleware({ runId: 'custom-run' });

    expect(middleware.specificationVersion).toBe('v3');
    expect(middleware.wrapGenerate).toBeDefined();
    expect(middleware.wrapStream).toBeDefined();
  });

  it('should use custom runId in database calls', async () => {
    const customRunId = 'test-run-123';
    const middleware = devToolsMiddleware({ runId: customRunId });

    const mockDoGenerate = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'test' }],
      finishReason: { unified: 'stop', raw: 'stop' },
      usage: { inputTokens: { total: 5 }, outputTokens: { total: 10 } },
      warnings: [],
    });

    const mockModel = {
      specificationVersion: 'v3' as const,
      modelId: 'test-model',
      provider: 'test-provider',
      doGenerate: mockDoGenerate,
      doStream: vi.fn(),
    };

    await middleware.wrapGenerate!({
      doGenerate: mockDoGenerate,
      params: {
        prompt: [{ role: 'user', content: [{ type: 'text', text: 'test' }] }],
      },
      model: mockModel,
    });

    // Verify createRun was called with custom runId
    expect(db.createRun).toHaveBeenCalledWith(customRunId);

    // Verify createStep was called with the custom runId
    const createStepCall = (db.createStep as any).mock.calls[0][0];
    expect(createStepCall.run_id).toBe(customRunId);
  });

  it('should throw error in production environment', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    expect(() => devToolsMiddleware()).toThrow(
      '@ai-sdk/devtools should not be used in production',
    );

    process.env.NODE_ENV = originalEnv;
  });
});
