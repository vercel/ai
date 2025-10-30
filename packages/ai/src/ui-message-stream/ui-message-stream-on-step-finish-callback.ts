import { UIMessage } from '../ui/ui-messages';

// A minimal, structurally correct UI message representing just a single step.
// It preserves id/role/metadata from the full message and replaces parts with the
// parts produced in this step. This avoids unsafe type assertions for generic UI_MESSAGE.
export type StepUIMessage<UI_MESSAGE extends UIMessage> = Pick<
  UI_MESSAGE,
  'id' | 'role' | 'metadata'
> & {
  parts: Array<UI_MESSAGE['parts'][number]>;
};

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
     * The object maintains structural compatibility with UI messages and
     * includes id/role/metadata from the current response message.
     */
    stepMessage: StepUIMessage<UI_MESSAGE>;

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
