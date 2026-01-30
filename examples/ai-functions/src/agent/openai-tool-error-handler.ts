import { openai } from '@ai-sdk/openai';
import { stepCountIs, tool, ToolLoopAgent } from 'ai';
import * as z from 'zod';
import { run } from '../lib/run';
import { print } from '../lib/print';

// Custom error class for recoverable validation errors
class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

const agent = new ToolLoopAgent({
  model: openai('gpt-4o'),
  instructions: 'You are a helpful assistant that can perform calculations.',
  stopWhen: stepCountIs(5), // Set max steps at agent creation
  tools: {
    // A tool that validates input and may throw ValidationError
    calculate: tool({
      description: 'Perform a calculation. The number must be positive.',
      inputSchema: z.object({
        operation: z.enum(['add', 'multiply', 'divide']),
        a: z.number().describe('First number (must be positive)'),
        b: z.number().describe('Second number (must be positive)'),
      }),
      execute: async ({ operation, a, b }) => {
        // Validate inputs - throw ValidationError for recoverable issues
        if (a <= 0 || b <= 0) {
          throw new ValidationError(
            'Both numbers must be positive. Please try again with positive numbers.',
          );
        }

        // Perform calculation
        switch (operation) {
          case 'add':
            return { result: a + b };
          case 'multiply':
            return { result: a * b };
          case 'divide':
            if (b === 0) {
              throw new ValidationError('Cannot divide by zero.');
            }
            return { result: a / b };
        }
      },
    }),
    // A tool that may encounter system errors
    fetchData: tool({
      description: 'Fetch data from an external source',
      inputSchema: z.object({
        url: z.string(),
      }),
      execute: async ({ url }) => {
        // Simulate a system error that should NOT be sent to LLM
        if (url === 'http://unreachable.example.com') {
          throw new Error('Network timeout - system unavailable');
        }

        // Simulate validation error that SHOULD be sent to LLM
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
          throw new ValidationError(
            'URL must start with http:// or https://. Please provide a valid URL.',
          );
        }

        return { data: 'Example data from ' + url };
      },
    }),
  },
  // Configure error handler to send ValidationErrors to the LLM
  // but retry system errors
  experimental_toolErrorHandler: async ({ error }) => {
    // Let the LLM handle validation errors - it can fix the input
    if (error instanceof ValidationError) {
      return 'send-to-llm';
    }

    // Retry system errors - don't send to LLM
    return 'retry';
  },
});

run(async () => {
  console.log('Example 1: ValidationError (sent to LLM for recovery)');
  console.log('='.repeat(60));

  const result1 = await agent.generate({
    prompt: 'Calculate the sum of -5 and 3',
  });

  print('Final response:', result1.text);
  print('Steps taken:', result1.steps.length);
  print(
    'Tool calls:',
    result1.steps.flatMap(s => s.toolCalls.map(tc => tc.toolName)),
  );

  console.log('\n');
  console.log('Example 2: Another ValidationError');
  console.log('='.repeat(60));

  const result2 = await agent.generate({
    prompt: 'Fetch data from invalid-url',
  });

  print('Final response:', result2.text);
  print('Steps taken:', result2.steps.length);
});
