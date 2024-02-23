import { LanguageModel } from '../language-model';
import { ChatPrompt } from '../prompt/chat-prompt';
import { InstructionPrompt } from '../prompt/instruction-prompt';
import { Tool } from '../tool/tool';
import { ToolDefinition } from '../tool/tool-definition';
import { runToolsTransformation } from './run-tools-transformation';
import { StreamMessageTextResponse } from './stream-message-text-response';

/**
 * Streams a complex message object. Beyond just text streaming, it can stream tool calls, data, annotations, etc.
 *
 * STATUS: WIP. Only supports text streaming for now.
 */
export async function streamMessage({
  model,
  prompt,
  tools = [],
}: {
  model: LanguageModel;
  prompt: string | InstructionPrompt | ChatPrompt;
  tools?: Array<
    ToolDefinition<string, unknown> | Tool<string, unknown, unknown>
  >;
}): Promise<StreamMessageResult> {
  const modelStream = await model.doStream({ prompt, tools });

  const toolStream = runToolsTransformation({
    tools,
    generatorStream: modelStream,
  });

  return {
    toTextResponse() {
      return new StreamMessageTextResponse(toolStream);
    },
  };
}

// TODO implement async iterable as well as stream
export interface StreamMessageResult {
  // TODO abort(): void;

  toTextResponse(): Response;
}
