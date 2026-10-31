/** An incremental parser for the JSON input of a single streaming tool call. */
export type ToolInputParser = {
  /** Consume a delta and return a partial value that remains stable after later pushes. */
  push: (delta: string) => unknown;
  /** Release resources when the input completes or the stream exits. */
  dispose: () => void;
};
