import { ImagePart, TextPart } from './content-part';

/**
 * A single text instruction prompt. It can contain an optional system message to define
 * the role and behavior of the language model.
 *
 * The instruction can be a text instruction or a multi-modal instruction.
 *
 * @example
 * ```ts
 * {
 *   system: "You are a celebrated poet.", // optional
 *   instruction: "Write a story about a robot learning to love",
 * }
 * ```
 */
export type InstructionPrompt =
  | string
  | {
      /**
       * Optional system message to provide context for the language model. Note that for some models,
       * changing the system message can impact the results, because the model may be trained on the default system message.
       */
      system?: string;

      /**
       * The instruction for the model.
       */
      instruction: InstructionContent;

      /**
       * Response prefix that will be injected in the prompt at the beginning of the response.
       * This is useful for guiding the model by starting its response with a specific text.
       */
      responsePrefix?: string;
    };

export type InstructionContent = string | Array<TextPart | ImagePart>;

export function isInstructionPrompt(
  prompt: unknown,
): prompt is InstructionPrompt {
  return (
    typeof prompt === 'string' ||
    (typeof prompt === 'object' && prompt != null && 'instruction' in prompt)
  );
}
