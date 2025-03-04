export type OpenAIResponsesPrompt = Array<OpenAIResponsesMessage>;

export type OpenAIResponsesMessage = {
  role: 'user';
  content: Array<{
    type: 'input_text';
    text: string;
  }>;
};
