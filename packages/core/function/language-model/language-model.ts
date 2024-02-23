import { ToolDefinition } from './tool/tool-definition';
import { LanguageModelPrompt } from './prompt';
import { Schema } from '../schema/schema';

export interface LanguageModel {
  // TODO include usage data
  // TODO support tool calls
  doGenerate(options: { prompt: LanguageModelPrompt }): PromiseLike<{
    text: string;
  }>;

  doGenerateJsonText(options: {
    schema: Schema<unknown>;
    prompt: LanguageModelPrompt;
  }): PromiseLike<{
    jsonText: string;
  }>;

  doStream(options: {
    prompt: LanguageModelPrompt;
    tools?: Array<ToolDefinition<string, unknown>>;
  }): PromiseLike<ReadableStream<LanguageModelStreamPart>>;
}

export type LanguageModelErrorStreamPart = {
  type: 'error';
  error: unknown;
};

export type LanguageModelStreamPart =
  | {
      type: 'text-delta';
      textDelta: string;
    }
  | {
      type: 'tool-call';
      id: string | null;
      name: string;
      args: unknown;
    }
  | LanguageModelErrorStreamPart;
