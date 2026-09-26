export type PerplexityAgentInput = Array<PerplexityAgentInputItem>;

export type PerplexityAgentInputItem =
  | {
      type: 'message';
      role: 'system' | 'developer' | 'user' | 'assistant';
      content: string | PerplexityAgentInputContent[];
    }
  | {
      type: 'function_call';
      call_id: string;
      name: string;
      arguments: string;
      thought_signature?: string;
    }
  | {
      type: 'function_call_output';
      call_id: string;
      name?: string;
      output: string;
      thought_signature?: string;
    };

export type PerplexityAgentInputContent =
  | {
      type: 'input_text';
      text: string;
    }
  | {
      type: 'input_image';
      image_url: string;
    };
