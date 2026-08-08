import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateText, tool } from 'ai';
import assert from 'node:assert/strict';
import { z } from 'zod';

const propertyName = 'userInputExactlyAsIs';
const propertyDescription =
  "The user's prompt as is, do not modify it or infer. Copy it verbatim.";
const prompt =
  'Show me quarterly sales for the Seattle waterfront kiosk, location code SEA-WF-042.';
const requestBodies: string[] = [];
const google = createGoogleGenerativeAI({
  fetch: async (url, init) => {
    if (typeof init?.body === 'string') {
      requestBodies.push(init.body);
    }
    return fetch(url, init);
  },
});

async function generateToolInput(
  schema: z.ZodObject<{ userInputExactlyAsIs: z.ZodString }>,
) {
  const result = await generateText({
    model: google('gemini-2.5-flash'),
    temperature: 0,
    tools: {
      capture: tool({
        description: 'Capture the requested value.',
        inputSchema: schema,
      }),
    },
    toolChoice: { type: 'tool', toolName: 'capture' },
    prompt,
  });

  assert.equal(result.toolCalls.length, 1, 'expected one forced tool call');

  return result.toolCalls[0].input as {
    userInputExactlyAsIs: string;
  };
}

async function main() {
  const zodSchema = z.object({
    [propertyName]: z.string().describe(propertyDescription),
  });
  let result: { userInputExactlyAsIs: string } | undefined;

  for (let attempt = 0; attempt < 5; attempt++) {
    result = await generateToolInput(zodSchema);
    if (result.userInputExactlyAsIs === prompt) {
      break;
    }
  }

  for (const requestBody of requestBodies) {
    assert.match(requestBody, /"parametersJsonSchema":/);
    assert.doesNotMatch(requestBody, /"parameters":/);
  }

  assert.equal(
    result?.userInputExactlyAsIs,
    prompt,
    'Gemini should copy the prompt verbatim instead of summarizing it',
  );

  console.log(
    JSON.stringify(
      {
        model: 'gemini-2.5-flash',
        prompt,
        propertyDescription,
        requestBodies,
        result,
      },
      null,
      2,
    ),
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
