export declare interface AzureChatCompletions {
  id: string;
  created: Date;
  choices: AzureChatChoice[];
  systemFingerprint?: string;
  usage?: AzureCompletionsUsage;
  promptFilterResults: any[]; // marker
}

export declare interface AzureChatChoice {
  message?: AzureChatResponseMessage;
  index: number;
  finishReason: string | null;
  delta?: AzureChatResponseMessage;
}

export declare interface AzureChatResponseMessage {
  role: string;
  content: string | null;
  toolCalls: AzureChatCompletionsFunctionToolCall[];
  functionCall?: AzureFunctionCall;
}

export declare interface AzureCompletionsUsage {
  completionTokens: number;
  promptTokens: number;
  totalTokens: number;
}

export declare interface AzureFunctionCall {
  name: string;
  arguments: string;
}

export declare interface AzureChatCompletionsFunctionToolCall {
  type: 'function';
  function: AzureFunctionCall;
  id: string;
}
