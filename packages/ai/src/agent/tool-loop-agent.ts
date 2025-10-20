import { generateText } from '../generate-text/generate-text';
import { GenerateTextResult } from '../generate-text/generate-text-result';
import {
  InferGenerateOutput,
  InferStreamOutput,
  Output,
} from '../generate-text/output';
import { stepCountIs } from '../generate-text/stop-condition';
import { streamText } from '../generate-text/stream-text';
import { StreamTextResult } from '../generate-text/stream-text-result';
import { ToolSet } from '../generate-text/tool-set';
import { Prompt } from '../prompt/prompt';
import { Agent, AgentCallParameters } from './agent';
import { ToolLoopAgentSettings } from './tool-loop-agent-settings';

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
  OUTPUT extends Output = never,
> implements Agent<TOOLS, OUTPUT>
{
  readonly version = 'agent-v1';

  private readonly settings: ToolLoopAgentSettings<TOOLS, OUTPUT>;

  constructor(settings: ToolLoopAgentSettings<TOOLS, OUTPUT>) {
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
  async generate(
    options: AgentCallParameters,
  ): Promise<GenerateTextResult<TOOLS, InferGenerateOutput<OUTPUT>>> {
    const { instructions, stopWhen, ...settings } = this.settings;

    return generateText({
      ...settings,
      system: instructions,
      stopWhen: stopWhen ?? stepCountIs(20),
      ...options,
    });
  }

  /**
   * Streams an output from the agent (streaming).
   */
  stream(
    options: AgentCallParameters,
  ): StreamTextResult<TOOLS, InferStreamOutput<OUTPUT>> {
    const { instructions, stopWhen, ...settings } = this.settings;

    return streamText({
      ...settings,
      system: instructions,
      stopWhen: stopWhen ?? stepCountIs(20),
      ...options,
    });
  }
}
