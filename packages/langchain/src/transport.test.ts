import { useLangSmithDeployment } from './transport';
import { describe, it, expect } from 'vitest';

describe('useLangSmithDeployment', () => {
  it('should create transport with options', () => {
    const transport = useLangSmithDeployment({
      url: 'https://test.langsmith.app',
      apiKey: 'test-key',
    });

    expect('sendMessages' in transport).toBe(true);
    expect('reconnectToStream' in transport).toBe(true);
  });

  it('should create transport with only url', () => {
    const transport = useLangSmithDeployment({
      url: 'https://test.langsmith.app',
    });

    expect('sendMessages' in transport).toBe(true);
  });

  it('should create transport with custom graphId', () => {
    const transport = useLangSmithDeployment({
      url: 'https://test.langsmith.app',
      graphId: 'custom-agent',
    });

    expect('sendMessages' in transport).toBe(true);
  });

  it('should throw error for reconnectToStream', async () => {
    const transport = useLangSmithDeployment({
      url: 'https://test.langsmith.app',
    });

    await expect(
      transport.reconnectToStream({ chatId: 'chat-1' }),
    ).rejects.toThrow('Method not implemented.');
  });
});
