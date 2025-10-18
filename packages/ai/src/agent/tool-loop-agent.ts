import { generateText } from '../generate-text/generate-text';
import { GenerateTextResult } from '../generate-text/generate-text-result';
import { stepCountIs } from '../generate-text/stop-condition';
import { streamText } from '../generate-text/stream-text';
import { StreamTextResult } from '../generate-text/stream-text-result';
import { ToolSet } from '../generate-text/tool-set';
import { Prompt } from '../prompt/prompt';
import { convertToModelMessages } from '../ui/convert-to-model-messages';
import { InferUITools, UIMessage } from '../ui/ui-messages';
import { ToolLoopAgentSettings } from './tool-loop-agent-settings';
import { Agent } from './agent';

/**
 * A tool loop agent is an agent that runs tools in a loop. In each step,
 * it calls the LLM, and if there are tool calls, it executes the tools
 * and calls the LLM again in a new step with the tool results.
 *
 * The loop continues until:
 * - A finish reasoning other than tool-calls is returned, or
 * - A tool that is invoked does not have an execute function, or
 * - A tool call needs approval, or
 * - A stop condition is met (default stop condition is stepCountIs(20))
 */
export class ToolLoopAgent<
  TOOLS extends ToolSet = {},
  OUTPUT = never,
  OUTPUT_PARTIAL = never,
> implements Agent<TOOLS, OUTPUT, OUTPUT_PARTIAL>
{
  readonly version = 'agent-v1';

  private readonly settings: ToolLoopAgentSettings<
    TOOLS,
    OUTPUT,
    OUTPUT_PARTIAL
  >;

  constructor(settings: ToolLoopAgentSettings<TOOLS, OUTPUT, OUTPUT_PARTIAL>) {
    this.settings = settings;
  }

  /**
   * The id of the agent.
   */
  get id(): string | undefined {
    return this.settings.id;
  }

  /**
   * The tools that the agent can use.
   */
  get tools(): TOOLS {
    return this.settings.tools as TOOLS;
  }

  /**
   * Generates an output from the agent (non-streaming).
   */
  async generate(options: Prompt): Promise<GenerateTextResult<TOOLS, OUTPUT>> {
    return generateText({
      ...this.settings,
      stopWhen: this.settings.stopWhen ?? stepCountIs(20),
      ...options,
    });
  }

  /**
   * Streams an output from the agent (streaming).
   */
  stream(options: Prompt): StreamTextResult<TOOLS, OUTPUT_PARTIAL> {
    return streamText({
      ...this.settings,
      stopWhen: this.settings.stopWhen ?? stepCountIs(20),
      ...options,
    });
  }

  /**
   * Creates a response object that streams UI messages to the client.
   */
  respond(options: {
    messages: UIMessage<never, never, InferUITools<TOOLS>>[];
  }): Response {
    return this.stream({
      prompt: convertToModelMessages(options.messages, { tools: this.tools }),
    }).toUIMessageStreamResponse<
      UIMessage<never, never, InferUITools<TOOLS>>
    >();
  }
}
