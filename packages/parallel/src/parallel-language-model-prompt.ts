export type ParallelPrompt = Array<ParallelMessage>;

export type ParallelMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string | ParallelMessageContent[];
};

export type ParallelMessageContent =
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

