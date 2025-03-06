export type OpenAIResponsesPrompt = Array<OpenAIResponsesMessage>;

export type OpenAIResponsesMessage =
  | OpenAIResponsesUserMessage
  | OpenAIResponsesAssistantMessage;

export type OpenAIResponsesUserMessage = {
  role: 'user';
  content: Array<{
    type: 'input_text';
    text: string;
  }>;
};

export type OpenAIResponsesAssistantMessage = {
  role: 'assistant';
  content: Array<{
    type: 'output_text';
    text: string;
  }>;
};
