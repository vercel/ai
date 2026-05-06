import type {
  LanguageModelV4FilePart,
  LanguageModelV4Prompt,
  LanguageModelV4ToolResultOutput,
  SharedV4Warning,
} from '@ai-sdk/provider';
import {
  convertToBase64,
  getTopLevelMediaType,
  isFullMediaType,
  resolveFullMediaType,
  resolveProviderReference,
} from '@ai-sdk/provider-utils';
import type {
  GoogleInteractionsContent,
  GoogleInteractionsFunctionResultContent,
  GoogleInteractionsImageContent,
  GoogleInteractionsInput,
  GoogleInteractionsTextContent,
  GoogleInteractionsTurn,
} from './google-interactions-prompt';

export type GoogleInteractionsMediaResolution =
  | 'low'
  | 'medium'
  | 'high'
  | 'ultra_high';

export type ConvertToGoogleInteractionsInputResult = {
  input: GoogleInteractionsInput;
  systemInstruction: string | undefined;
  warnings: Array<SharedV4Warning>;
};

/**
 * Converts an AI SDK `LanguageModelV4Prompt` into the Gemini Interactions
 * request shape (`{ input, system_instruction }`).
 *
 * Handles text parts, file parts (image / audio / document / video, all four
 * `data.type` shapes), tool-call/tool-result round-tripping, per-block
 * `signature` round-tripping (`thought.signature`, `function_call.signature`),
 * and statefulness compaction (drop assistant/tool turns whose
 * `providerOptions.google.interactionId === previousInteractionId`).
 *
 * NOTE on PRD Open Q3 (empty-text-with-signature carrier hack from the
 * `:generateContent` provider): unnecessary on Interactions because
 * `thought.signature` and `function_call.signature` are explicit fields on
 * the wire (verified against `googleapis/js-genai`
 * `src/interactions/resources/interactions.ts` `ThoughtContent` /
 * `FunctionCallContent`). When an input reasoning part has empty text + a
 * signature, the converter emits a `thought` block with `signature` and an
 * omitted `summary` — no synthetic empty-text carrier needed.
 */
export function convertToGoogleInteractionsInput({
  prompt,
  previousInteractionId,
  store,
  mediaResolution,
}: {
  prompt: LanguageModelV4Prompt;
  previousInteractionId?: string;
  store?: boolean;
  /**
   * Per-block media resolution applied to every image / video input block
   * (the Interactions wire format places `resolution` on the block, not at
   * the top level). See js-genai
   * `src/interactions/resources/interactions.ts` `ImageContent.resolution`
   * and `VideoContent.resolution`.
   */
  mediaResolution?: GoogleInteractionsMediaResolution;
}): ConvertToGoogleInteractionsInputResult {
  const warnings: Array<SharedV4Warning> = [];

  /*
   * Behavior matrix per PRD § "Public-API contracts" → "Configurable behavior
   * matrix":
   *
   * - `previousInteractionId` set + `store !== false` → compact history (drop
   *   assistant/tool turns whose `providerMetadata.google.interactionId`
   *   matches), emit `previous_interaction_id`.
   * - `previousInteractionId` set + `store === false` → emit warning
   *   (incoherent combo), still send full history (NO compaction).
   * - `store === false`, no `previousInteractionId` → no compaction.
   * - Default → no compaction.
   *
   * The actual `previous_interaction_id` / `store` body fields are emitted in
   * the language model's `getArgs`; this converter only handles the history
   * shape and the warning.
   */
  const incoherentCombo = previousInteractionId != null && store === false;
  const shouldCompact = previousInteractionId != null && store !== false;
  if (incoherentCombo) {
    warnings.push({
      type: 'other',
      message:
        'google.interactions: providerOptions.google.previousInteractionId was set together with store: false. These are incoherent (the prior interaction cannot be referenced when nothing was stored on the server); the full history will be sent and previous_interaction_id will still be emitted.',
    });
  }

  const compactedPrompt = shouldCompact
    ? compactPromptForPreviousInteraction({
        prompt,
        previousInteractionId,
      })
    : prompt;

  const systemTexts: Array<string> = [];
  const turns: Array<GoogleInteractionsTurn> = [];

  for (const message of compactedPrompt) {
    switch (message.role) {
      case 'system': {
        systemTexts.push(message.content);
        break;
      }
      case 'user': {
        const content: Array<GoogleInteractionsContent> = [];
        for (const part of message.content) {
          if (part.type === 'text') {
            const block: GoogleInteractionsTextContent = {
              type: 'text',
              text: part.text,
            };
            content.push(block);
          } else if (part.type === 'file') {
            const fileBlock = convertFilePartToContent({
              part,
              warnings,
              mediaResolution,
            });
            if (fileBlock != null) {
              content.push(fileBlock);
            }
          }
        }
        const merged = mergeAdjacentTextContent(content);
        if (merged.length > 0) {
          turns.push({ role: 'user', content: merged });
        }
        break;
      }
      case 'assistant': {
        const content: Array<GoogleInteractionsContent> = [];
        for (const part of message.content) {
          if (part.type === 'text') {
            content.push({ type: 'text', text: part.text });
          } else if (part.type === 'reasoning') {
            const signature = part.providerOptions?.google?.signature as
              | string
              | undefined;
            content.push({
              type: 'thought',
              ...(signature != null ? { signature } : {}),
              summary:
                part.text.length > 0
                  ? [{ type: 'text', text: part.text }]
                  : undefined,
            });
          } else if (part.type === 'tool-call') {
            const signature = part.providerOptions?.google?.signature as
              | string
              | undefined;
            const args =
              typeof part.input === 'string'
                ? safeParseToolArgs(part.input)
                : ((part.input ?? {}) as Record<string, unknown>);
            content.push({
              type: 'function_call',
              id: part.toolCallId,
              name: part.toolName,
              arguments: args,
              ...(signature != null ? { signature } : {}),
            });
          } else {
            warnings.push({
              type: 'other',
              message: `google.interactions: unsupported assistant content part type "${part.type}"; part dropped.`,
            });
          }
        }
        if (content.length > 0) {
          turns.push({ role: 'model', content });
        }
        break;
      }
      case 'tool': {
        /*
         * Tool-result messages are emitted as a `user` turn whose content
         * holds one `function_result` block per tool-result part. Wire shape
         * (verified against `googleapis/js-genai`
         * `samples/interactions_function_calling_client_state.ts` and
         * `src/interactions/resources/interactions.ts` `FunctionResultContent`
         * around line 979 — RESOLVES PRD Open Q2):
         *
         *   {
         *     role: 'user',
         *     content: [
         *       {
         *         type: 'function_result',
         *         call_id: <id from the matching function_call block>,
         *         name: <tool name>,
         *         result: <string | unknown | Array<TextContent|ImageContent>>,
         *         is_error?: boolean,
         *         signature?: string,
         *       },
         *     ],
         *   }
         *
         * The `result` field is a discriminated union: a plain string for
         * text-only results, or an array of `text` / `image` content blocks
         * for mixed text/image results. Our converter takes the AI SDK
         * canonical `LanguageModelV4ToolResultOutput` and maps:
         * - `{ type: 'text', value }` → `result: <string>`
         * - `{ type: 'json', value }` → `result: <stringified JSON>`
         * - `{ type: 'error-text', value }` → `result: <string>` + `is_error: true`
         * - `{ type: 'error-json', value }` → `result: <stringified JSON>` + `is_error: true`
         * - `{ type: 'execution-denied', reason }` → `result: <reason>` + `is_error: true`
         * - `{ type: 'content', value: [...] }` → `result: Array<text|image>`
         *   where each AI SDK `file` part with `mediaType: image/*` becomes
         *   an Interactions `image` block (file-data path matches
         *   `convertFilePartToContent` for top-level user images), and `text`
         *   parts pass through. Non-image file parts fall back to a warning
         *   because `FunctionResultContent.result` only accepts text/image.
         */
        const content: Array<GoogleInteractionsContent> = [];
        for (const part of message.content) {
          if (part.type !== 'tool-result') {
            warnings.push({
              type: 'other',
              message: `google.interactions: unsupported tool message part type "${part.type}"; part dropped.`,
            });
            continue;
          }
          const block = convertToolResultPart({
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            output: part.output,
            signature: part.providerOptions?.google?.signature as
              | string
              | undefined,
            warnings,
          });
          content.push(block);
        }
        if (content.length > 0) {
          turns.push({ role: 'user', content });
        }
        break;
      }
    }
  }

  const systemInstruction =
    systemTexts.length > 0 ? systemTexts.join('\n\n') : undefined;

  let input: GoogleInteractionsInput;
  if (turns.length === 0) {
    input = '';
  } else if (
    turns.length === 1 &&
    turns[0].role === 'user' &&
    Array.isArray(turns[0].content)
  ) {
    /*
     * Single-turn user prompt: send the bare `Array<Content>` shape per the
     * Interactions API's preferred single-turn format.
     */
    input = turns[0].content;
  } else {
    input = turns;
  }

  return { input, systemInstruction, warnings };
}

/**
 * Maps a single AI SDK `LanguageModelV4FilePart` to a Gemini Interactions
 * content block (`image` / `audio` / `document` / `video`).
 *
 * Rules for the four `data.type` cases:
 * - `data` (Uint8Array / base64) → block with inline `data` (base64) +
 *   `mime_type`.
 * - `url` → block with `uri` set to the URL string verbatim.
 * - `reference` → block with `uri` set to the resolved `google` provider
 *   reference (Files API URI like
 *   `https://generativelanguage.googleapis.com/v1beta/files/<id>`).
 * - `text` → collapsed to a `text` block (the wire format has no text-on-file
 *   shape; emit an inline text block instead).
 */
function convertFilePartToContent({
  part,
  warnings,
  mediaResolution,
}: {
  part: LanguageModelV4FilePart;
  warnings: Array<SharedV4Warning>;
  mediaResolution?: GoogleInteractionsMediaResolution;
}): GoogleInteractionsContent | undefined {
  if (part.data.type === 'text') {
    return {
      type: 'text',
      text: part.data.text,
    };
  }

  const topLevel = getTopLevelMediaType(part.mediaType);
  let kind: 'image' | 'audio' | 'video' | 'document' | undefined;
  switch (topLevel) {
    case 'image':
      kind = 'image';
      break;
    case 'audio':
      kind = 'audio';
      break;
    case 'video':
      kind = 'video';
      break;
    case 'application':
      kind = 'document';
      break;
    default:
      kind = undefined;
  }

  if (kind == null) {
    warnings.push({
      type: 'other',
      message: `google.interactions: unsupported file media type "${part.mediaType}"; part dropped.`,
    });
    return undefined;
  }

  /*
   * `resolution` is per-block on the wire (`ImageContent.resolution`,
   * `VideoContent.resolution`); only image and video carry it (see
   * `googleapis/js-genai` `src/interactions/resources/interactions.ts`).
   * Audio / document blocks ignore the option silently.
   */
  const resolutionField =
    mediaResolution != null && (kind === 'image' || kind === 'video')
      ? { resolution: mediaResolution }
      : {};

  switch (part.data.type) {
    case 'data': {
      const mimeType = resolveFullMediaType({ part });
      return {
        type: kind,
        data: convertToBase64(part.data.data),
        mime_type: mimeType,
        ...resolutionField,
      };
    }
    case 'url': {
      return {
        type: kind,
        uri: part.data.url.toString(),
        ...(isFullMediaType(part.mediaType)
          ? { mime_type: part.mediaType }
          : {}),
        ...resolutionField,
      };
    }
    case 'reference': {
      const uri = resolveProviderReference({
        reference: part.data.reference,
        provider: 'google',
      });
      return {
        type: kind,
        uri,
        ...(isFullMediaType(part.mediaType)
          ? { mime_type: part.mediaType }
          : {}),
        ...resolutionField,
      };
    }
  }
}

/*
 * Drops assistant turns that were part of the linked interaction
 * (`previousInteractionId`) so the API doesn't see them re-sent on top of its
 * server-side state. Also drops any subsequent `tool` (tool-result) message
 * whose `tool-result.toolCallId` matches a `tool-call.toolCallId` from the
 * dropped assistant turn — server-state already has the matching tool result
 * baked in, and re-sending it without its paired call would be malformed.
 *
 * An assistant message is considered "part of the linked interaction" if any
 * of its content parts carry `providerOptions.google.interactionId ===
 * previousInteractionId`. This is stamped by `parseGoogleInteractionsOutputs`
 * (and the stream transformer) on every output content part.
 *
 * User messages are always kept regardless of where they fell in the prior
 * conversation — only assistant model output and its tool plumbing live on the
 * server. (Note that the AI SDK does not stamp `interactionId` onto user
 * messages, so even if it did, this function would not have a way to identify
 * which user message belongs to which interaction.)
 */
function compactPromptForPreviousInteraction({
  prompt,
  previousInteractionId,
}: {
  prompt: LanguageModelV4Prompt;
  previousInteractionId: string;
}): LanguageModelV4Prompt {
  const out: LanguageModelV4Prompt = [];
  const droppedToolCallIds = new Set<string>();

  for (const message of prompt) {
    if (message.role === 'assistant') {
      const matchesLinkedInteraction = message.content.some(part => {
        const partInteractionId = (
          part as { providerOptions?: { google?: { interactionId?: string } } }
        ).providerOptions?.google?.interactionId;
        return partInteractionId === previousInteractionId;
      });
      if (matchesLinkedInteraction) {
        for (const part of message.content) {
          if (part.type === 'tool-call') {
            droppedToolCallIds.add(part.toolCallId);
          }
        }
        continue;
      }
      out.push(message);
      continue;
    }
    if (message.role === 'tool') {
      const remaining = message.content.filter(part => {
        if (part.type !== 'tool-result') {
          return true;
        }
        return !droppedToolCallIds.has(part.toolCallId);
      });
      if (remaining.length === 0) {
        continue;
      }
      out.push({
        ...message,
        content: remaining as typeof message.content,
      });
      continue;
    }
    out.push(message);
  }

  return out;
}

function safeParseToolArgs(input: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(input);
    if (
      parsed != null &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed)
    ) {
      return parsed as Record<string, unknown>;
    }
    return { value: parsed };
  } catch {
    return { value: input };
  }
}

function convertToolResultPart({
  toolCallId,
  toolName,
  output,
  signature,
  warnings,
}: {
  toolCallId: string;
  toolName: string;
  output: LanguageModelV4ToolResultOutput;
  signature: string | undefined;
  warnings: Array<SharedV4Warning>;
}): GoogleInteractionsFunctionResultContent {
  const base = {
    type: 'function_result' as const,
    call_id: toolCallId,
    name: toolName,
    ...(signature != null ? { signature } : {}),
  };

  switch (output.type) {
    case 'text':
      return { ...base, result: output.value };
    case 'json':
      return { ...base, result: JSON.stringify(output.value) };
    case 'error-text':
      return { ...base, is_error: true, result: output.value };
    case 'error-json':
      return { ...base, is_error: true, result: JSON.stringify(output.value) };
    case 'execution-denied':
      return {
        ...base,
        is_error: true,
        result: output.reason ?? 'Tool execution denied by user.',
      };
    case 'content': {
      const blocks: Array<
        GoogleInteractionsTextContent | GoogleInteractionsImageContent
      > = [];
      for (const item of output.value) {
        if (item.type === 'text') {
          blocks.push({ type: 'text', text: item.text });
        } else if (item.type === 'file') {
          const topLevel = getTopLevelMediaType(item.mediaType);
          if (topLevel !== 'image') {
            warnings.push({
              type: 'other',
              message: `google.interactions: tool-result file with mediaType "${item.mediaType}" is not supported (Interactions \`function_result.result\` accepts only text and image content); part dropped.`,
            });
            continue;
          }
          const imageBlock = filePartToImageBlock({ part: item, warnings });
          if (imageBlock != null) {
            blocks.push(imageBlock);
          }
        } else {
          warnings.push({
            type: 'other',
            message: `google.interactions: tool-result content part type "${(item as { type: string }).type}" is not supported; part dropped.`,
          });
        }
      }
      return { ...base, result: blocks };
    }
  }
}

function filePartToImageBlock({
  part,
  warnings,
}: {
  part: {
    type: 'file';
    mediaType: string;
    data:
      | { type: 'data'; data: Uint8Array | string }
      | { type: 'url'; url: URL }
      | { type: 'reference'; reference: Record<string, string> }
      | { type: 'text'; text: string };
    filename?: string;
  };
  warnings: Array<SharedV4Warning>;
}): GoogleInteractionsImageContent | undefined {
  switch (part.data.type) {
    case 'data': {
      const mimeType = isFullMediaType(part.mediaType)
        ? part.mediaType
        : resolveFullMediaType({
            part: {
              type: 'file',
              mediaType: part.mediaType,
              data: part.data,
            } as LanguageModelV4FilePart,
          });
      return {
        type: 'image',
        data: convertToBase64(part.data.data),
        mime_type: mimeType,
      };
    }
    case 'url':
      return {
        type: 'image',
        uri: part.data.url.toString(),
        ...(isFullMediaType(part.mediaType)
          ? { mime_type: part.mediaType }
          : {}),
      };
    case 'reference': {
      const uri = resolveProviderReference({
        reference: part.data.reference,
        provider: 'google',
      });
      return {
        type: 'image',
        uri,
        ...(isFullMediaType(part.mediaType)
          ? { mime_type: part.mediaType }
          : {}),
      };
    }
    case 'text': {
      warnings.push({
        type: 'other',
        message:
          'google.interactions: tool-result image part with `data.type === "text"` is not representable as an image; part dropped.',
      });
      return undefined;
    }
  }
}

/*
 * Collapses runs of adjacent text content blocks within a single user message
 * into one combined text block, separated by a blank line. The Interactions
 * API has no `text+data` shape, so a `data.type === 'text'` file part is
 * already lowered to a `text` block by `convertFilePartToContent`; merging
 * keeps the wire shape compact and preserves intent when an inline text file
 * sits next to a regular text part. Text blocks carrying `annotations` are
 * left untouched (annotations are tied to specific text spans).
 */
function mergeAdjacentTextContent(
  content: Array<GoogleInteractionsContent>,
): Array<GoogleInteractionsContent> {
  if (content.length < 2) {
    return content;
  }
  const result: Array<GoogleInteractionsContent> = [];
  for (const block of content) {
    const last = result[result.length - 1];
    if (
      block.type === 'text' &&
      last != null &&
      last.type === 'text' &&
      (last as GoogleInteractionsTextContent).annotations == null &&
      (block as GoogleInteractionsTextContent).annotations == null
    ) {
      const merged: GoogleInteractionsTextContent = {
        type: 'text',
        text: `${(last as GoogleInteractionsTextContent).text}\n\n${(block as GoogleInteractionsTextContent).text}`,
      };
      result[result.length - 1] = merged;
      continue;
    }
    result.push(block);
  }
  return result;
}
