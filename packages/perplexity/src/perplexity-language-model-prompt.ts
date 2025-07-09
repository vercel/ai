export type PerplexityPrompt = Array<PerplexityMessage>;

export type PerplexityMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string | PerplexityMessageContent[];
};

export type PerplexityMessageContent =
  | {
      type: 'text';
      text: string;
    }
  | {
      type: 'image_url';
      image_url: {
        url: string;
      };
    };
