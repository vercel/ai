import { generateText } from '../generate-text/generate-text';
import { GenerateTextResult } from '../generate-text/generate-text-result';
import { Output } from '../generate-text/output';
import { stepCountIs } from '../generate-text/stop-condition';
import { streamText } from '../generate-text/stream-text';
import { StreamTextResult } from '../generate-text/stream-text-result';
import { ToolSet } from '../generate-text/tool-set';
import { Prompt } from '../prompt';
import { Agent, AgentCallParameters, AgentStreamParameters } from './agent';
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
  CALL_OPTIONS = never,
  TOOLS extends ToolSet = {},
  OUTPUT extends Output = never,
> implements Agent<CALL_OPTIONS, TOOLS, OUTPUT>
{
  readonly version = 'agent-v1';

  private readonly settings: ToolLoopAgentSettings<CALL_OPTIONS, TOOLS, OUTPUT>;

  constructor(settings: ToolLoopAgentSettings<CALL_OPTIONS, TOOLS, OUTPUT>) {
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

  private async prepareCall(
    options: AgentCallParameters<CALL_OPTIONS>,
  ): Promise<
    Omit<
      ToolLoopAgentSettings<CALL_OPTIONS, TOOLS, OUTPUT>,
      'prepareCall' | 'instructions'
    > &
      Prompt
  > {
    const baseCallArgs = {
      ...this.settings,
      stopWhen: this.settings.stopWhen ?? stepCountIs(20),
      ...options,
    };

    const preparedCallArgs =
      (await this.settings.prepareCall?.(baseCallArgs)) ?? baseCallArgs;

    const { instructions, messages, prompt, ...callArgs } = preparedCallArgs;

    return {
      ...callArgs,

      // restore prompt types
      ...({ system: instructions, messages, prompt } as Prompt),
    };
  }

  /**
   * Generates an output from the agent (non-streaming).
   */
  async generate({
    abortSignal,
    timeout,
    ...options
  }: AgentCallParameters<CALL_OPTIONS>): Promise<
    GenerateTextResult<TOOLS, OUTPUT>
  > {
    return generateText({
      ...(await this.prepareCall(options)),
      abortSignal,
      timeout,
    });
  }

  /**
   * Streams an output from the agent (streaming).
   */
  async stream({
    abortSignal,
    timeout,
    experimental_transform,
    ...options
  }: AgentStreamParameters<CALL_OPTIONS, TOOLS>): Promise<
    StreamTextResult<TOOLS, OUTPUT>
  > {
    return streamText({
      ...(await this.prepareCall(options)),
      abortSignal,
      timeout,
      experimental_transform,
    });
  }
}
