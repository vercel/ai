import { generateText } from '../generate-text/generate-text';
import { GenerateTextResult } from '../generate-text/generate-text-result';
import { stepCountIs } from '../generate-text/stop-condition';
import { streamText } from '../generate-text/stream-text';
import { StreamTextResult } from '../generate-text/stream-text-result';
import { ToolSet } from '../generate-text/tool-set';
import { Prompt } from '../prompt/prompt';
import { convertToModelMessages } from '../ui/convert-to-model-messages';
import { InferUITools, UIMessage } from '../ui/ui-messages';
import { BasicAgentSettings } from './basic-agent-settings';
import { Agent } from './agent';

/**
 * The Agent class provides a structured way to encapsulate LLM configuration, tools,
 * and behavior into reusable components.
 *
 * It handles the agent loop for you, allowing the LLM to call tools multiple times in
 * sequence to accomplish complex tasks.
 *
 * Define agents once and use them across your application.
 */
export class BasicAgent<
  TOOLS extends ToolSet = {},
  OUTPUT = never,
  OUTPUT_PARTIAL = never,
> implements Agent<TOOLS, OUTPUT, OUTPUT_PARTIAL>
{
  private readonly settings: BasicAgentSettings<TOOLS, OUTPUT, OUTPUT_PARTIAL>;

  constructor(settings: BasicAgentSettings<TOOLS, OUTPUT, OUTPUT_PARTIAL>) {
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
