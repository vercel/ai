export type PerplexityPrompt = Array<PerplexityMessage>;

export type PerplexityMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};
