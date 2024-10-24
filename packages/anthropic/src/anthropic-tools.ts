import { JSONSchema7 } from '@ai-sdk/provider';

export type AnthropicTool =
  | {
      name: string;
      description: string | undefined;
      input_schema: JSONSchema7;
    }
  | {
      name: string;
      type: 'computer_20241022';
      display_width_px: number;
      display_height_px: number;
      display_number: number;
    }
  | {
      name: string;
      type: 'text_editor_20241022';
    }
  | {
      name: string;
      type: 'bash_20241022';
    };

export type AnthropicToolChoice =
  | { type: 'auto' | 'any' }
  | { type: 'tool'; name: string };
