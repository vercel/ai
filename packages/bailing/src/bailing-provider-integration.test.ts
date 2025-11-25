import { expect, it, describe } from 'vitest';
import { createBailing } from './bailing-provider';

// Test that the provider is properly configured
describe('bailing provider - integration tests', () => {
  // Create bailing provider with API key
  const bailing = createBailing({
    apiKey: process.env.BAILING_API_KEY,
  });

  // Test non-streaming generation with real API
  it('should generate non-streaming responses with real API', async () => {
    const model = bailing.chatModel('Ling-1T');
    const result = await model.doGenerate({
      prompt: [{ role: 'user', content: [{ type: 'text', text: 'Hello, how are you?' }] }],
      temperature: 0.7,
    });

    expect(result).toBeDefined();
    expect(result.content).toBeDefined();
    expect(result.finishReason).toBeDefined();
    console.log('Non-streaming response:', result.content);
  }, 30000); // 30 second timeout

  // Test streaming generation with real API
  it('should generate streaming responses with real API', async () => {
    const model = bailing.chatModel('Ling-1T');
    const result = await model.doStream({
      prompt: [{ role: 'user', content: [{ type: 'text', text: 'Hello, how are you?' }] }],
      temperature: 0.7,
    });

    expect(result).toBeDefined();
    expect(result.stream).toBeDefined();

    // Collect stream chunks
    const chunks: any[] = [];
    const reader = result.stream.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        console.log('Stream chunk:', value);
      }
    } finally {
      reader.releaseLock();
    }

    expect(chunks.length).toBeGreaterThan(0);
    console.log('Total stream chunks:', chunks.length);
  }, 30000); // 30 second timeout

  // Test web search functionality with real API
  it('should support web search with real API', async () => {
    const model = bailing.chatModel('Ling-1T');
    const result = await model.doGenerate({
      prompt: [{ role: 'user', content: [{ type: 'text', text: 'What is the latest news today?' }] }],
      providerOptions: {
        bailing: {
          enable_search: true,
        },
      },
    });

    expect(result).toBeDefined();
    expect(result.content).toBeDefined();
    console.log('Web search response:', result.content);
  }, 180000); // 180 second timeout

  // Test forced web search functionality with real API
  it('should support forced web search with real API', async () => {
    const model = bailing.chatModel('Ling-1T');
    const result = await model.doGenerate({
      prompt: [{ role: 'user', content: [{ type: 'text', text: 'What is the latest news today?' }] }],
      providerOptions: {
        bailing: {
          enable_search: true,
          search_options: {
            forced_search: true,
          },
        },
      },
    });

    expect(result).toBeDefined();
    expect(result.content).toBeDefined();
    console.log('Forced web search response:', result.content);
  }, 30000); // 30 second timeout

  // Test temperature parameter with real API
  it('should support temperature parameter with real API', async () => {
    const model = bailing.chatModel('Ling-1T');
    const result = await model.doGenerate({
      prompt: [{ role: 'user', content: [{ type: 'text', text: 'Tell me a creative story' }] }],
      temperature: 0.9, // High temperature for more creative output
    });

    expect(result).toBeDefined();
    expect(result.content).toBeDefined();
    console.log('High temperature response:', result.content);
  }, 30000); // 30 second timeout

  // Test top_p parameter with real API
  it('should support top_p parameter with real API', async () => {
    const model = bailing.chatModel('Ling-1T');
    const result = await model.doGenerate({
      prompt: [{ role: 'user', content: [{ type: 'text', text: 'Tell me a creative story' }] }],
      topP: 0.9, // High top_p for more diverse output
    });

    expect(result).toBeDefined();
    expect(result.content).toBeDefined();
    console.log('High top_p response:', result.content);
  }, 30000); // 30 second timeout
});
