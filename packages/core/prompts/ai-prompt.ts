import type { SimpleMessage } from '../shared/types';

// A simple interface for the AIInput object that is required for the Llama2 API
export interface ReplicateAIInput {
  prompt: string;
  system_prompt?: string;
}

// this signature is expected by OpenAI's Node Library; we include it for convenience in calling the library
export interface ChatCompletionMessageParam {
  role: 'system' | 'user' | 'assistant' | 'function';
  content: string | null;
  function_call?: any;
  name?: string;
}

export interface AIPrompt {
  buildPrompt(messages: SimpleMessage[]): string;
  addMessage(
    content: string, // parameter ordering is due to role being optional
    role?: 'user' | 'assistant' | 'system' | 'function',
    location?: 'before' | 'after',
  ): void;

  // We overload toPrompt because different AI APIs expect differently-typed prompts.
  // Our goal is for the calling application to be able to call toPrompt on the AIPrompt object and
  // receive a return that can just be plugged into the AI service's library-defined call to the API.
  // Implementing functions will have the responsibility of converting the prompt to the appropriate type.

  toPrompt():
    | string
    | ChatCompletionMessageParam[]
    | ReplicateAIInput
    | undefined;
}
