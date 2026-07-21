import { createAnthropic } from '@ai-sdk/anthropic';
import { generateText, streamText, tool } from 'ai';
import { z } from 'zod';

const quotedQuestion = '"What should I do next after this run?"';
const expectedDescription =
  `Today you post every run to Strava, but Strava does not answer the question: ${quotedQuestion}. ` +
  'It is a great log, but it is not adaptive.';

const Task = z.object({
  id: z.number().optional(),
  description: z.string(),
  type: z.enum(['feature', 'bug']),
  passes: z.boolean(),
});

const WebsiteUpdateInput = z.object({
  tasks: z.array(Task),
  assets: z.array(z.string()).optional(),
  website_path: z.string(),
});

type WebsiteUpdateInput = z.infer<typeof WebsiteUpdateInput>;

const prompt = `Call website_update exactly once with:
- website_path: /home/user/pace-landing
- one feature task with passes false
- the task description exactly as written between <description> tags:
<description>${expectedDescription}</description>
Do not replace the double quotes around the question with single quotes or remove them.`;

const capturedResponses: Array<Promise<{ stream: boolean; text: string }>> = [];

const anthropic = createAnthropic({
  fetch: async (url, options) => {
    const requestBody = JSON.parse(String(options?.body)) as {
      stream?: boolean;
    };
    const response = await fetch(url, options);
    const clonedResponse = response.clone();

    capturedResponses.push(
      clonedResponse.text().then(text => ({
        stream: requestBody.stream === true,
        text,
      })),
    );

    return response;
  },
});

function assertExecutedInput(
  method: 'generateText' | 'streamText',
  inputs: WebsiteUpdateInput[],
) {
  if (inputs.length !== 1) {
    throw new Error(
      `${method}: expected website_update execute to run once, ran ${inputs.length} times`,
    );
  }

  const description = inputs[0].tasks[0]?.description;
  if (description !== expectedDescription) {
    throw new Error(
      `${method}: quoted task description did not reach execute intact: ${JSON.stringify(description)}`,
    );
  }

  console.log(
    `${method}: execute received quoted question intact: ${quotedQuestion}`,
  );
}

function createWebsiteUpdateTool(executedInputs: WebsiteUpdateInput[]) {
  return tool({
    description: 'Update a website by executing the supplied task list.',
    inputSchema: WebsiteUpdateInput,
    execute: async input => {
      executedInputs.push(input);
      return { updated: true };
    },
  });
}

async function runGenerateText() {
  const executedInputs: WebsiteUpdateInput[] = [];
  const result = await generateText({
    model: anthropic('claude-sonnet-4-5'),
    maxOutputTokens: 2048,
    tools: {
      website_update: createWebsiteUpdateTool(executedInputs),
    },
    toolChoice: { type: 'tool', toolName: 'website_update' },
    prompt,
  });

  const invalidCall = result.toolCalls.find(toolCall => toolCall.invalid);
  if (invalidCall != null) {
    throw new Error(
      `generateText: invalid tool input: ${JSON.stringify(invalidCall.input)}`,
    );
  }

  assertExecutedInput('generateText', executedInputs);
}

async function runStreamText() {
  const executedInputs: WebsiteUpdateInput[] = [];
  const result = streamText({
    model: anthropic('claude-sonnet-4-5'),
    maxOutputTokens: 2048,
    tools: {
      website_update: createWebsiteUpdateTool(executedInputs),
    },
    toolChoice: { type: 'tool', toolName: 'website_update' },
    prompt,
  });

  for await (const part of result.fullStream) {
    if (part.type === 'error') {
      throw part.error;
    }
    if (part.type === 'tool-call' && part.invalid) {
      throw new Error(
        `streamText: invalid tool input: ${JSON.stringify(part.input)}`,
      );
    }
  }

  assertExecutedInput('streamText', executedInputs);
}

async function main() {
  await runGenerateText();
  await runStreamText();

  for (const response of await Promise.all(capturedResponses)) {
    console.log(
      response.stream
        ? '--- LIVE ANTHROPIC STREAM RESPONSE ---'
        : '--- LIVE ANTHROPIC GENERATE RESPONSE ---',
    );
    console.log(response.text);
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
