import { readFile } from 'node:fs/promises';
import { createGoogleGenerativeAI } from '../../../../packages/google/dist/index.mjs';
import { generateText } from '../../../../packages/ai/dist/index.mjs';

async function main() {
  const recordedResponse = await readFile(
    new URL(
      '../../../../packages/google/src/__fixtures__/google-code-execution-multiple-results.json',
      import.meta.url,
    ),
    'utf8',
  );

  const google = createGoogleGenerativeAI({
    apiKey: 'test-api-key',
    generateId: () => 'code-execution-call',
    fetch: async () =>
      new Response(recordedResponse, {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
  });

  await generateText({
    model: google('gemini-3-flash-preview'),
    tools: {
      code_execution: google.tools.codeExecution({}),
    },
    prompt:
      "use code execution to execute the following code snippet:\nprint('ok')\nprint(1/0)",
  });

  throw new Error(
    'Expected generateText to reject the recorded response with multiple code execution results.',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
