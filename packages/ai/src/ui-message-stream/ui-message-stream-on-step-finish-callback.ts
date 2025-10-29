import { UIMessage } from '../ui/ui-messages';

export type UIMessageStreamOnStepFinishCallback<UI_MESSAGE extends UIMessage> =
  (event: {
    /**
     * The accumulated list of UI messages up to this point in the stream.
     * This includes all steps that have finished so far.
     */
    messages: UI_MESSAGE[];

    /**
     * The step number (1-based index) indicating which step just finished.
     */
    stepNumber: number;

    /**
     * The current response message state at the end of this step.
     * This represents the accumulated state of the message streamed so far.
     */
    responseMessage: UI_MESSAGE;

    /**
     * A message containing only the parts that were added in this step.
     * This represents the new content generated in this specific step.
     */
    stepMessage: UI_MESSAGE;

    /**
     * Indicates whether the response message is a continuation of the last original message,
     * or if a new message was created.
     */
    isContinuation: boolean;

    /**
     * Indicates whether the stream was aborted.
     */
    isAborted: boolean;

    /**
     * The parts that were added in this step (since the last start-step or since the beginning of the stream).
     * This helps identify what content was generated in this specific step.
     */
    stepParts: Array<UI_MESSAGE['parts'][number]>;
  }) => PromiseLike<void> | void;
