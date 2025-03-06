export type OpenAIResponsesPrompt = Array<OpenAIResponsesMessage>;

export type OpenAIResponsesMessage =
  | OpenAIResponsesUserMessage
  | OpenAIResponsesAssistantMessage;

export type OpenAIResponsesUserMessage = {
  role: 'user';
  content: Array<
    | { type: 'input_text'; text: string }
    | { type: 'input_image'; image_url: string }
  >;
};

export type OpenAIResponsesAssistantMessage = {
  role: 'assistant';
  content: Array<{ type: 'output_text'; text: string }>;
};
