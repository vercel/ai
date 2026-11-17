import type { OpenAIModelIds } from '../openai-model-catalog';

export type OpenAIRealtimeModelId = OpenAIModelIds['realtime'] | (string & {});

export type OpenAIRealtimeModelOptions = Record<string, never>;
