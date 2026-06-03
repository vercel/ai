import { convertOpenAICompatibleChatUsage } from '@ai-sdk/openai-compatible/internal';

export const convertBaiduChatUsage = convertOpenAICompatibleChatUsage;

export type BaiduChatUsage = Parameters<typeof convertBaiduChatUsage>[0];
