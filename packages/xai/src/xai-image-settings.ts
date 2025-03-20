import { OpenAICompatibleImageSettings } from '@ai-sdk/openai-compatible';

export type XaiImageModelId = 'grok-2-image' | (string & {});

export interface XaiImageSettings extends OpenAICompatibleImageSettings {}
