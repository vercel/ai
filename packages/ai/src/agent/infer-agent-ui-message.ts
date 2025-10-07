import { InferUITools, UIMessage } from '../ui/ui-messages';
import { InferAgentTools } from './inter-agent-tools';

/**
 * Infer the UI message type of an agent.
 */
export type InferAgentUIMessage<AGENT> = UIMessage<
  never,
  never,
  InferUITools<InferAgentTools<AGENT>>
>;
