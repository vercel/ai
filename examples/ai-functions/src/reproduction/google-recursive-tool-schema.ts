import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateText, stepCountIs, streamText, tool, type ToolSet } from 'ai';
import { z } from 'zod/v4';

const Condition: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.object({ term: z.string() }),
    z.object({ and: z.array(Condition) }),
    z.object({ or: z.array(Condition) }),
  ]),
);

const recursiveSearchTool = tool({
  description: 'Search with a recursive condition tree.',
  inputSchema: z.object({ condition: Condition }),
  execute: async input => input,
});

const siblingTool = tool({
  description: 'A non-recursive sibling tool.',
  inputSchema: z.object({ value: z.string() }),
  execute: async input => input,
});

const discoveryTool = tool({
  description: 'Discover the recursive search tool.',
  inputSchema: z.object({}),
  execute: async () => ({ discovered: 'search' }),
});

type RecordedRequest = {
  url: string;
  body: any;
};

function googleResponse(parts: Array<Record<string, unknown>>) {
  return {
    candidates: [
      {
        content: { parts, role: 'model' },
        finishReason: 'STOP',
        index: 0,
      },
    ],
    usageMetadata: {
      promptTokenCount: 1,
      candidatesTokenCount: 1,
      totalTokenCount: 2,
    },
    modelVersion: 'gemini-3.7-flash',
  };
}

function toolCallPart(name: string, args: Record<string, unknown>, id: string) {
  return {
    functionCall: { name, args, id },
    thoughtSignature: `signature-${id}`,
  };
}

function createMockGoogle(responses: Array<ReturnType<typeof googleResponse>>) {
  const requests: RecordedRequest[] = [];
  let responseIndex = 0;

  const google = createGoogleGenerativeAI({
    apiKey: 'dummy-never-sent',
    fetch: async (input, init) => {
      const responseBody = responses[responseIndex++];
      if (responseBody == null) {
        throw new Error('Unexpected extra Google request.');
      }

      requests.push({
        url: String(input),
        body:
          typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
      });

      if (String(input).includes(':streamGenerateContent')) {
        const chunks = [
          {
            ...responseBody,
            candidates: responseBody.candidates.map(candidate => ({
              ...candidate,
              finishReason: undefined,
            })),
          },
          googleResponse([{ text: '' }]),
        ];

        return new Response(
          chunks.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`).join(''),
          {
            headers: { 'content-type': 'text/event-stream' },
          },
        );
      }

      return new Response(JSON.stringify(responseBody), {
        headers: { 'content-type': 'application/json' },
      });
    },
  });

  return { google, requests };
}

function declaredToolNames(request: RecordedRequest | undefined): string[] {
  return (
    request?.body?.tools?.flatMap(
      (entry: any) =>
        entry.functionDeclarations?.map(
          (declaration: any) => declaration.name,
        ) ?? [],
    ) ?? []
  );
}

function errorMessage(error: unknown) {
  return error instanceof Error
    ? `${error.name}: ${error.message}`
    : String(error);
}

async function checkGenerateText() {
  const { google, requests } = createMockGoogle([
    googleResponse([
      toolCallPart(
        'search',
        { condition: { or: [{ term: 'x' }, { term: 'y' }] } },
        'search-call',
      ),
      toolCallPart('sibling', { value: 'still available' }, 'sibling-call'),
    ]),
  ]);

  try {
    const result = await generateText({
      model: google('gemini-3.7-flash'),
      prompt: "Search for videos matching 'x' or 'y'.",
      tools: {
        search: recursiveSearchTool,
        sibling: siblingTool,
      },
    });

    const toolNames = result.toolCalls.map(call => call.toolName);
    const requestToolNames = declaredToolNames(requests[0]);
    if (
      requests.length !== 1 ||
      !requestToolNames.includes('search') ||
      !requestToolNames.includes('sibling') ||
      !toolNames.includes('search') ||
      !toolNames.includes('sibling')
    ) {
      throw new Error(
        'generateText did not preserve the recursive tool and its sibling through the provider request.',
      );
    }

    return { completed: true, requestCount: requests.length };
  } catch (error) {
    return {
      completed: false,
      requestCount: requests.length,
      error: errorMessage(error),
    };
  }
}

async function checkStreamText() {
  const { google, requests } = createMockGoogle([
    googleResponse([
      toolCallPart(
        'search',
        { condition: { and: [{ term: 'x' }, { term: 'y' }] } },
        'stream-search-call',
      ),
    ]),
  ]);
  let streamError: unknown;
  const toolNames: string[] = [];

  const result = streamText({
    model: google('gemini-3.7-flash'),
    prompt: "Stream a search for videos matching 'x' and 'y'.",
    tools: { search: recursiveSearchTool },
    onError: ({ error }) => {
      streamError = error;
    },
  });

  for await (const part of result.fullStream) {
    if (part.type === 'tool-call') {
      toolNames.push(part.toolName);
    }
  }

  const requestToolNames = declaredToolNames(requests[0]);
  if (
    streamError != null ||
    requests.length !== 1 ||
    !requestToolNames.includes('search') ||
    !toolNames.includes('search')
  ) {
    return {
      completed: false,
      requestCount: requests.length,
      error:
        streamError == null
          ? 'streamText did not complete with the recursive tool.'
          : errorMessage(streamError),
    };
  }

  return { completed: true, requestCount: requests.length };
}

async function checkDelayedActivation() {
  const { google, requests } = createMockGoogle([
    googleResponse([toolCallPart('discover', {}, 'discover-call')]),
    googleResponse([{ text: 'The recursive search tool is now available.' }]),
  ]);
  const tools = {
    discover: discoveryTool,
    search: recursiveSearchTool,
  } satisfies ToolSet;

  try {
    const result = await generateText({
      model: google('gemini-3.7-flash'),
      prompt: 'Discover a tool, then continue with it available.',
      tools,
      activeTools: ['discover'],
      stopWhen: stepCountIs(2),
      prepareStep: ({ stepNumber }) => ({
        activeTools: stepNumber === 0 ? ['discover'] : ['search'],
      }),
    });

    const firstRequestTools = declaredToolNames(requests[0]);
    const secondRequestTools = declaredToolNames(requests[1]);
    if (
      result.steps.length !== 2 ||
      requests.length !== 2 ||
      !firstRequestTools.includes('discover') ||
      firstRequestTools.includes('search') ||
      !secondRequestTools.includes('search')
    ) {
      throw new Error(
        'prepareStep did not complete the step where the recursive tool became active.',
      );
    }

    return { completed: true, requestCount: requests.length };
  } catch (error) {
    return {
      completed: false,
      requestCount: requests.length,
      error: errorMessage(error),
    };
  }
}

async function main() {
  const generate = await checkGenerateText();
  const stream = await checkStreamText();
  const delayedActivation = await checkDelayedActivation();

  console.log(JSON.stringify({ generate, stream, delayedActivation }, null, 2));

  if (
    !generate.completed ||
    !stream.completed ||
    !delayedActivation.completed
  ) {
    throw new Error(
      'Issue #19488 reproduced: recursive Google tool schemas abort generateText, streamText, and delayed prepareStep activation before the affected request is sent.',
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
