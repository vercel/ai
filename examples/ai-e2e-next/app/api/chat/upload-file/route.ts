import { anthropic } from '@ai-sdk/anthropic';
import { google } from '@ai-sdk/google';
import { openai } from '@ai-sdk/openai';
import { xai } from '@ai-sdk/xai';
import {
  consumeStream,
  convertToModelMessages,
  streamText,
  UIMessage,
} from 'ai';

export const maxDuration = 60;

const providerMap = {
  anthropic: (modelId: string) => anthropic(modelId),
  google: (modelId: string) => google(modelId),
  openai: (modelId: string) => openai.responses(modelId),
  xai: (modelId: string) => xai(modelId),
};

export async function POST(req: Request) {
  const {
    messages,
    modelId,
    providerId,
  }: {
    messages: UIMessage[];
    modelId: string;
    providerId: 'anthropic' | 'google' | 'openai' | 'xai';
  } = await req.json();

  const model = providerMap[providerId](modelId);

  const result = streamText({
    model,
    messages: await convertToModelMessages(messages),
    abortSignal: req.signal,
  });

  return result.toUIMessageStreamResponse({
    consumeSseStream: consumeStream,
  });
}
