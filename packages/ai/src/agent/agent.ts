import { GenerateTextResult } from '../generate-text/generate-text-result';
import { StreamTextResult } from '../generate-text/stream-text-result';
import { ToolSet } from '../generate-text/tool-set';
import { Prompt } from '../prompt/prompt';
import { InferUITools, UIMessage } from '../ui/ui-messages';

/**
 * An agent is a reusable component that that has tools and that
 * can generate or stream content.
 */
export interface Agent<
  TOOLS extends ToolSet = {},
  OUTPUT = never,
  OUTPUT_PARTIAL = never,
> {
  /**
   * The id of the agent.
   */
  id: string | undefined;

  /**
   * The tools that the agent can use.
   */
  tools: TOOLS;

  /**
   * Generates an output from the agent (non-streaming).
   */
  generate(options: Prompt): PromiseLike<GenerateTextResult<TOOLS, OUTPUT>>;

  /**
   * Streams an output from the agent (streaming).
   */
  stream(options: Prompt): StreamTextResult<TOOLS, OUTPUT_PARTIAL>;

  /**
   * Creates a response object that streams UI messages to the client.
   */
  respond(options: {
    messages: UIMessage<never, never, InferUITools<TOOLS>>[];
  }): Response;
}
