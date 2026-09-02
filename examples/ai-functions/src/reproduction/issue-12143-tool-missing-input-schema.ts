import { InvalidArgumentError, generateText } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { z } from 'zod/v4';

// Reproduction for https://github.com/vercel/ai/issues/12143
//
// `parameters` was renamed to `inputSchema` in AI SDK 5. A tool that still uses
// `parameters` leaves `inputSchema` undefined at runtime. Before the fix that
// tool was serialized with an empty input schema (`{ properties: {} }`), and
// providers such as Vertex AI rejected the request with a confusing
// "functionDeclaration parameters schema should be of type OBJECT" error.
//
// The tool definition is now rejected with a descriptive error instead.

async function main() {
  const model = new MockLanguageModelV4({
    doGenerate: async ({ prompt: _prompt }) => {
      throw new Error('the request should never reach the provider');
    },
  });

  try {
    await generateText({
      model,
      prompt: 'Read package.json',
      tools: {
        readFile: {
          description: 'Read a file',
          // the AI SDK 4 spelling: leaves `inputSchema` undefined
          parameters: z.object({ filePath: z.string() }),
        },
      } as any,
    });

    console.log('no error thrown - the bug is still present');
  } catch (error) {
    console.log(
      'InvalidArgumentError:',
      InvalidArgumentError.isInstance(error),
    );
    console.log('message:', (error as Error).message);
  }
}

main().catch(console.error);
