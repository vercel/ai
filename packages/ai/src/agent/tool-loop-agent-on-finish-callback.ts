import { TextOnFinishEvent } from '../generate-text/text-on-finish-callback';
import { ToolSet } from '../generate-text/tool-set';

/**
 * Callback that is set using the `onFinish` option.
 *
 * @param event - The event that is passed to the callback.
 */
export type ToolLoopAgentOnFinishCallback<TOOLS extends ToolSet = {}> = (
  event: TextOnFinishEvent<TOOLS>,
) => PromiseLike<void> | void;
