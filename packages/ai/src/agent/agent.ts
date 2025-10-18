import { GenerateTextResult } from '../generate-text/generate-text-result';
import { StreamTextResult } from '../generate-text/stream-text-result';
import { ToolSet } from '../generate-text/tool-set';
import { Prompt } from '../prompt/prompt';
import { InferUITools, UIMessage } from '../ui/ui-messages';

/**
 * An Agent receives a prompt (text or messages) and generates or streams an output
 * that consists of steps, tool calls, data parts, etc.
 *
 * You can implement your own Agent by implementing the `Agent` interface,
 * or use the `ToolLoopAgent` class.
 */
export interface Agent<
  TOOLS extends ToolSet = {},
  OUTPUT = never,
  OUTPUT_PARTIAL = never,
> {
  /**
   * The specification version of the agent interface. This will enable
   * us to evolve the agent interface and retain backwards compatibility.
   */
  readonly version: 'agent-v1';

  /**
   * The id of the agent.
   */
  readonly id: string | undefined;

  /**
   * The tools that the agent can use.
   */
  readonly tools: TOOLS;

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
