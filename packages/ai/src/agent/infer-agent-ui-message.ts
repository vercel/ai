import { InferUITools, UIMessage } from '../ui/ui-messages';
import { InferAgentTools } from './infer-agent-tools';

/**
 * Infer the UI message type of an agent.
 */
export type InferAgentUIMessage<
  AGENT,
  MESSAGE_METADATA = unknown,
  PART_METADATA = unknown,
> = UIMessage<
  MESSAGE_METADATA,
  never,
  InferUITools<InferAgentTools<AGENT>>,
  PART_METADATA
>;
