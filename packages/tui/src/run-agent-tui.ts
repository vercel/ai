import { AgentTUIRunner } from './agent-tui-runner';
import type { Agent } from 'ai';

/**
 * Controls how terminal UI sections for stream parts are displayed.
 *
 * - `full`: show the section header and full content.
 * - `collapsed`: show only the section header.
 * - `auto-collapsed`: show the latest section expanded until another visible
 *   section appears, then collapse it.
 * - `hidden`: omit the section entirely.
 */
export type TerminalPartDisplayMode =
  | 'full'
  | 'collapsed'
  | 'auto-collapsed'
  | 'hidden';

/**
 * Controls which response statistic is shown.
 *
 * - `outputTokenCount`: show the number of output tokens in the response.
 * - `outputTokensPerSecond`: show output token throughput for the response.
 */
export type ResponseStatisticsMode =
  | 'outputTokenCount'
  | 'outputTokensPerSecond';

/**
 * An agent that is compatible with the terminal UI.
 *
 * It has no call options and no structured output.
 */
export type AgentTUIAgent = Agent<undefined, any, any, never>;

/**
 * Options for starting an agent in the default terminal UI.
 */
export type RunAgentTUIOptions = {
  /**
   * The agent to run.
   */
  agent: AgentTUIAgent;

  /**
   * The title shown in the terminal UI.
   */
  title?: string;

  /**
   * How tool calls should render.
   *
   * @default "auto-collapsed"
   */
  tools?: TerminalPartDisplayMode;

  /**
   * How reasoning parts should render.
   *
   * @default "auto-collapsed"
   */
  reasoning?: TerminalPartDisplayMode;

  /**
   * Which response statistic to show.
   *
   * @default "outputTokensPerSecond"
   */
  responseStatistics?: ResponseStatisticsMode;

  /**
   * The model context window size in tokens.
   *
   * When provided, the terminal UI shows the current total token usage as a
   * percentage of this context window.
   */
  contextSize?: number;
};

/**
 * Runs an agent in the default terminal UI until the user exits.
 */
export async function runAgentTUI(options: RunAgentTUIOptions) {
  await new AgentTUIRunner(options).run();
}
