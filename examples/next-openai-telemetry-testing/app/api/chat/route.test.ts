import { POST } from './route';
import { completionCounter } from '@/lib/telemetry';

// Mock the AI SDK
jest.mock('ai', () => ({
  generateText: jest.fn().mockResolvedValue({
    text: 'Test response',
    usage: { totalTokens: 50 },
  }),
}));

describe('Chat API Route', () => {
  it('should handle successful completion', async () => {
    const req = new Request('http://localhost:3000/api/chat', {
      method: 'POST',
      body: JSON.stringify({ prompt: 'Test prompt' }),
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.text).toBe('Test response');

    // Verify metrics were recorded
    const counterValue = completionCounter.bind({ status: 'success' }).value;
    expect(counterValue).toBe(1);
  });

  it('should handle errors', async () => {
    // Mock generateText to throw an error
    require('ai').generateText.mockRejectedValueOnce(new Error('Test error'));

    const req = new Request('http://localhost:3000/api/chat', {
      method: 'POST',
      body: JSON.stringify({ prompt: 'Test prompt' }),
    });

    await expect(POST(req)).rejects.toThrow('Test error');

    // Verify error metrics were recorded
    const counterValue = completionCounter.bind({ status: 'error' }).value;
    expect(counterValue).toBe(1);
  });
}); 