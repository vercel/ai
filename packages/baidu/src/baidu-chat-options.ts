import { z } from 'zod/v4';

export type BaiduChatModelId =
  | 'ernie-4.5-turbo-128k'
  | 'ernie-4.5-turbo-vl-32k'
  | 'ernie-x1-turbo-32k'
  | 'deepseek-v3.1'
  | (string & {});

export const baiduLanguageModelOptions = z.object({});

export type BaiduLanguageModelOptions = z.infer<
  typeof baiduLanguageModelOptions
>;
