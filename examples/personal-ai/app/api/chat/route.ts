import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  tool,
  type UIMessage,
} from 'ai';
import { z } from 'zod';
import {
  isAssistantMode,
  isModelForProvider,
  isProviderId,
  providers,
} from '@/lib/providers';

const requestSchema = z.object({
  messages: z.array(z.custom<UIMessage>()).min(1).max(50),
  provider: z.string(),
  model: z.string(),
  mode: z.string(),
});

const systemPrompts = {
  chat: 'You are a clear, thoughtful personal AI assistant. Be useful, honest about uncertainty, and concise by default. Help with questions and coding.',
  research:
    'You are a web research assistant. Search the web for current information before answering. Summarize findings clearly and distinguish sourced facts from your own analysis. Cite the search sources you used.',
  tasks:
    'You are a practical planning assistant. Turn the user request into a small, ordered, actionable checklist. You must call createTaskPlan with the plan title and tasks before giving a brief explanation. Do not claim to perform the tasks.',
} satisfies Record<string, string>;

export async function POST(request: Request) {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return Response.json(
      { error: 'Request body must be valid JSON.' },
      { status: 400 },
    );
  }

  const parsed = requestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return Response.json(
      { error: 'Expected messages, a provider, a model, and a mode.' },
      { status: 400 },
    );
  }

  const {
    messages,
    provider: providerValue,
    model,
    mode: modeValue,
  } = parsed.data;
  if (
    !isProviderId(providerValue) ||
    !isAssistantMode(modeValue) ||
    !isModelForProvider(providerValue, model)
  ) {
    return Response.json(
      { error: 'The selected provider, model, or mode is not supported.' },
      { status: 400 },
    );
  }

  const provider = providers[providerValue];
  const apiKey = process.env[provider.keyName];
  if (!apiKey) {
    return Response.json(
      {
        error: `Add ${provider.keyName} to examples/personal-ai/.env.local, then restart the app.`,
      },
      { status: 503 },
    );
  }

  let languageModel;
  let tools;
  if (providerValue === 'openai') {
    const client = createOpenAI({ apiKey });
    languageModel = client.responses(model);
    tools =
      modeValue === 'research'
        ? { webSearch: client.tools.webSearchPreview({}) }
        : undefined;
  } else if (providerValue === 'google') {
    const client = createGoogleGenerativeAI({ apiKey });
    languageModel = client(model);
    tools =
      modeValue === 'research'
        ? { googleSearch: client.tools.googleSearch({}) }
        : undefined;
  } else {
    const client = createAnthropic({ apiKey });
    languageModel = client(model);
    tools =
      modeValue === 'research'
        ? { webSearch: client.tools.webSearch_20250305({ maxUses: 5 }) }
        : undefined;
  }

  const taskTools =
    modeValue === 'tasks'
      ? {
          createTaskPlan: tool({
            description:
              'Create a short, ordered checklist for the user to track. This records a plan only and does not execute any task.',
            inputSchema: z.object({
              title: z.string().min(1).max(120),
              tasks: z.array(z.string().min(1).max(300)).min(1).max(12),
            }),
            execute: async ({ title, tasks }) => ({ title, tasks }),
          }),
        }
      : undefined;

  const result = streamText({
    model: languageModel,
    system: systemPrompts[modeValue],
    messages: await convertToModelMessages(messages),
    tools: { ...tools, ...taskTools },
    stopWhen: stepCountIs(5),
    abortSignal: request.signal,
  });

  return result.toUIMessageStreamResponse({
    sendSources: modeValue === 'research',
  });
}
