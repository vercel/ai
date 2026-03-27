import { generateText, tool, wrapLanguageModel } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

/**
 * Tool-Call Recovery Middleware Example
 *
 * Demonstrates a middleware pattern that adds system-level instructions
 * to improve tool-call reliability, combined with a bounded retry wrapper
 * that validates structured output against Zod schemas.
 *
 * This pattern is useful for production systems where tool-call arguments
 * are sometimes malformed (incomplete JSON, schema violations, or
 * markdown artifacts in arguments).
 */

// Define a schema for structured tool output
const extractedDataSchema = z.object({
  entities: z.array(
    z.object({
      name: z.string(),
      type: z.enum(['person', 'organization', 'location']),
      confidence: z.number().min(0).max(1),
    }),
  ),
  summary: z.string().max(500),
});

// Middleware that adds system instructions to encourage well-formed tool calls
const toolCallRecoveryMiddleware = {
  transformParams: async ({
    params,
  }: {
    params: Record<string, unknown>;
  }) => {
    const messages =
      (params.messages as Array<Record<string, unknown>>) ?? [];
    return {
      ...params,
      messages: [
        {
          role: 'system',
          content:
            'When calling tools, always provide valid JSON matching the tool schema exactly. ' +
            'Do not include markdown formatting or extra text in tool arguments.',
        },
        ...messages,
      ],
    };
  },
};

// Bounded retry wrapper for tool-calling with validation
async function generateWithRetry({
  prompt,
  maxRetries = 2,
}: {
  prompt: string;
  maxRetries?: number;
}) {
  const model = wrapLanguageModel({
    model: openai('gpt-4o-mini'),
    middleware: toolCallRecoveryMiddleware,
  });

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await generateText({
        model,
        tools: {
          extractData: tool({
            description:
              'Extract named entities and a summary from the given text.',
            parameters: extractedDataSchema,
            execute: async args => {
              const validated = extractedDataSchema.parse(args);
              return { status: 'success' as const, data: validated };
            },
          }),
        },
        prompt,
        maxSteps: 3,
      });

      return { result, attempt };
    } catch (error) {
      lastError = error as Error;
      console.warn(
        `Tool call attempt ${attempt + 1}/${maxRetries + 1} failed:`,
        (error as Error).message,
      );

      if (attempt < maxRetries) {
        const delay = 500 * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw new Error(
    `Tool call failed after ${maxRetries + 1} attempts. Last error: ${lastError?.message}`,
  );
}

async function main() {
  const prompt =
    'Extract entities from: "Satya Nadella, CEO of Microsoft, announced ' +
    'the new Azure AI features at the Build conference in Seattle."';

  try {
    const { result, attempt } = await generateWithRetry({ prompt });
    console.log('Tool calls completed successfully.');
    console.log(`Resolved on attempt: ${attempt + 1}`);
    console.log('Result:', JSON.stringify(result.toolResults, null, 2));
  } catch (error) {
    console.error('All retry attempts exhausted:', (error as Error).message);
  }
}

main().catch(console.error);
