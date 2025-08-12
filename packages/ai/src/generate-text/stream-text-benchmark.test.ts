import { describe, it } from 'vitest';
import { MockLanguageModelV2 } from '../test/mock-language-model-v2';
import { simulateReadableStream } from '../util/simulate-readable-stream';
import { streamText } from './stream-text';

describe('streamText benchmark', () => {
  const generateLongContent = (tokens: number) => {
    const chunks: any[] = [
      { type: 'text-start', id: 'text-1' },
    ];
    
    // Generate many token chunks to simulate a long response
    for (let i = 0; i < tokens; i++) {
      chunks.push({
        type: 'text-delta',
        id: 'text-1',
        delta: `Token${i} `,
      });
    }
    
    chunks.push(
      { type: 'text-end', id: 'text-1' },
      {
        type: 'finish',
        finishReason: 'stop',
        logprobs: undefined,
        usage: { inputTokens: 10, outputTokens: tokens, totalTokens: tokens + 10 },
      }
    );
    
    return chunks;
  };

  // Calculate approximate bytes for throughput measurement
  // Reuses the generateLongContent function to avoid duplication
  const calculateTotalBytes = (tokens: number) => {
    const chunks = generateLongContent(tokens);
    let totalBytes = 0;
    
    for (const chunk of chunks) {
      totalBytes += JSON.stringify(chunk).length;
    }
    
    return totalBytes;
  };

  it('should measure throughput for single stream', async () => {
    const tokenCount = 10000;
    const chunks = generateLongContent(tokenCount);
    const totalBytes = calculateTotalBytes(tokenCount);
    
    const model = new MockLanguageModelV2({
      doStream: async () => ({
        stream: simulateReadableStream({
          chunks,
          initialDelayInMs: null, // No delay
          chunkDelayInMs: null,   // No delay between chunks
        }),
      }),
    });

    const startTime = performance.now();
    
    const result = streamText({
      model,
      prompt: 'Test prompt',
    });
    
    await result.consumeStream();
    
    const endTime = performance.now();
    const duration = endTime - startTime;
    const tokensPerSecond = (tokenCount / duration) * 1000;
    const megabytesPerSecond = (totalBytes / (1024 * 1024)) / (duration / 1000);
    
    console.log(`Single stream benchmark results:`);
    console.log(`  Duration: ${duration.toFixed(2)}ms`);
    console.log(`  Tokens: ${tokenCount.toLocaleString()}`);
    console.log(`  Total data: ${(totalBytes / 1024).toFixed(2)} KB`);
    console.log(`  Throughput: ${tokensPerSecond.toFixed(0)} tokens/second`);
    console.log(`  Throughput: ${megabytesPerSecond.toFixed(2)} MB/s`);
  });

  it('should measure throughput for 100 concurrent streams', async () => {
    const tokensPerStream = 1000;
    const streamCount = 100;
    const chunks = generateLongContent(tokensPerStream);
    const bytesPerStream = calculateTotalBytes(tokensPerStream);
    const totalBytes = bytesPerStream * streamCount;
    const totalTokens = tokensPerStream * streamCount;
    
    const model = new MockLanguageModelV2({
      doStream: async () => ({
        stream: simulateReadableStream({
          chunks,
          initialDelayInMs: null, // No delay
          chunkDelayInMs: null,   // No delay between chunks
        }),
      }),
    });

    const startTime = performance.now();
    
    const streamPromises = [];
    for (let i = 0; i < streamCount; i++) {
      const result = streamText({
        model,
        prompt: `Test prompt ${i}`,
      });
      streamPromises.push(result.consumeStream());
    }
    
    await Promise.all(streamPromises);
    
    const endTime = performance.now();
    const duration = endTime - startTime;
    const tokensPerSecond = (totalTokens / duration) * 1000;
    const megabytesPerSecond = (totalBytes / (1024 * 1024)) / (duration / 1000);
    
    console.log(`\nConcurrent streams benchmark results:`);
    console.log(`  Duration: ${duration.toFixed(2)}ms`);
    console.log(`  Streams: ${streamCount}`);
    console.log(`  Total tokens: ${totalTokens.toLocaleString()}`);
    console.log(`  Total data: ${(totalBytes / (1024 * 1024)).toFixed(2)} MB`);
    console.log(`  Throughput: ${tokensPerSecond.toFixed(0)} tokens/second`);
    console.log(`  Throughput: ${megabytesPerSecond.toFixed(2)} MB/s`);
    console.log(`  Average per stream: ${(duration / streamCount).toFixed(2)}ms`);
  });
});