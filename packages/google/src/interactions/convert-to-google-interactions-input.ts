import type {
  LanguageModelV3FilePart,
  LanguageModelV3Prompt,
  LanguageModelV3ToolResultOutput,
  SharedV3Warning,
} from '@ai-sdk/provider';
import { convertToBase64 } from '@ai-sdk/provider-utils';
import type {
  GoogleInteractionsContent,
  GoogleInteractionsContentBlock,
  GoogleInteractionsFunctionResultContent,
  GoogleInteractionsImageContent,
  GoogleInteractionsInput,
  GoogleInteractionsStep,
  GoogleInteractionsTextContent,
} from './google-interactions-prompt';

function getTopLevelMediaType(mediaType: string): string {
  const slashIndex = mediaType.indexOf('/');
  return slashIndex === -1 ? mediaType : mediaType.substring(0, slashIndex);
}

function isFullMediaType(mediaType: string): boolean {
  const slashIndex = mediaType.indexOf('/');
  if (slashIndex === -1) {
    return false;
  }
  const subtype = mediaType.substring(slashIndex + 1);
  return subtype.length > 0 && subtype !== '*';
}

export type GoogleInteractionsMediaResolution =
  | 'low'
  | 'medium'
  | 'high'
  | 'ultra_high';

export type ConvertToGoogleInteractionsInputResult = {
  input: GoogleInteractionsInput;
  systemInstruction: string | undefined;
  warnings: Array<SharedV3Warning>;
};

/**
 * Converts an AI SDK `LanguageModelV3Prompt` into the Gemini Interactions
 * request shape (`{ input: Array<Step>, system_instruction }`).
 *
 * Prior assistant content round-trips as discrete steps:
 *   - text / image content → `model_output` step with a single `content` array
 *   - reasoning → `thought` step (`signature` + `summary`)
 *   - tool-call → `function_call` step
 * User turns (and tool-result turns from the previous round) are sent as
 * `user_input` steps whose `content[]` holds the user's parts (text, files,
 * and — for tool-result turns — `function_result` blocks).
 *
 * Handles text parts, file parts (image / audio / document / video, all four
 * `data.type` shapes), tool-call/tool-result round-tripping, per-step
 * `signature` round-tripping, and statefulness compaction (drop assistant/tool
 * turns whose `providerOptions.google.interactionId === previousInteractionId`).
 */
export function convertToGoogleInteractionsInput({
  prompt,
  previousInteractionId,
  store,
  mediaResolution,
}: {
  prompt: LanguageModelV3Prompt;
  previousInteractionId?: string;
  store?: boolean;
  mediaResolution?: GoogleInteractionsMediaResolution;
}): ConvertToGoogleInteractionsInputResult {
  const warnings: Array<SharedV3Warning> = [];

  /*
   * Behavior matrix for compaction:
   *
   * - `previousInteractionId` set + `store !== false` → compact history (drop
   *   assistant/tool turns whose `providerMetadata.google.interactionId`
   *   matches), emit `previous_interaction_id`.
   * - `previousInteractionId` set + `store === false` → emit warning
   *   (incoherent combo), still send full history (NO compaction).
   * - `store === false`, no `previousInteractionId` → no compaction.
   * - Default → no compaction.
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
  const steps: Array<GoogleInteractionsStep> = [];

  for (const message of compactedPrompt) {
    switch (message.role) {
      case 'system': {
        systemTexts.push(message.content);
        break;
      }
      case 'user': {
        const content: Array<GoogleInteractionsContentBlock> = [];
        for (const part of message.content) {
          if (part.type === 'text') {
            content.push({ type: 'text', text: part.text });
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
          steps.push({ type: 'user_input', content: merged });
        }
        break;
      }
      case 'assistant': {
        /*
         * Prior assistant content fans out into one step per logical block.
         * Adjacent text/image content blocks are coalesced into a single
         * `model_output` step (matching how the API emits them on output);
         * reasoning and tool-calls each become their own step.
         */
        let pendingModelOutput: Array<GoogleInteractionsContentBlock> = [];
        const flushModelOutput = () => {
          if (pendingModelOutput.length > 0) {
            steps.push({ type: 'model_output', content: pendingModelOutput });
            pendingModelOutput = [];
          }
        };

        for (const part of message.content) {
          if (part.type === 'text') {
            pendingModelOutput.push({ type: 'text', text: part.text });
          } else if (part.type === 'reasoning') {
            flushModelOutput();
            const signature = part.providerOptions?.google?.signature as
              | string
              | undefined;
            steps.push({
              type: 'thought',
              ...(signature != null ? { signature } : {}),
              summary:
                part.text.length > 0
                  ? [{ type: 'text', text: part.text }]
                  : undefined,
            });
          } else if (part.type === 'file') {
            const fileBlock = convertFilePartToContent({
              part,
              warnings,
              mediaResolution,
            });
            if (fileBlock != null) {
              pendingModelOutput.push(fileBlock);
            }
          } else if (part.type === 'tool-call') {
            flushModelOutput();
            const signature = part.providerOptions?.google?.signature as
              | string
              | undefined;
            const args =
              typeof part.input === 'string'
                ? safeParseToolArgs(part.input)
                : ((part.input ?? {}) as Record<string, unknown>);
            steps.push({
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
        flushModelOutput();
        break;
      }
      case 'tool': {
        /*
         * Tool-result messages are emitted as a `user_input` step whose
         * content holds one `function_result` block per tool-result part.
         * `function_result` remains a content-block type (it sits inside
         * a step), not a top-level step type.
         */
        const content: Array<GoogleInteractionsContentBlock> = [];
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
          steps.push({ type: 'user_input', content });
        }
        break;
      }
    }
  }

  const systemInstruction =
    systemTexts.length > 0 ? systemTexts.join('\n\n') : undefined;

  return { input: steps, systemInstruction, warnings };
}

/**
 * Maps a single AI SDK `LanguageModelV3FilePart` to a Gemini Interactions
 * content block (`image` / `audio` / `document` / `video`).
 *
 * Rules for the V3 `data` shapes:
 * - `Uint8Array` / `string` (base64) → block with inline `data` (base64) +
 *   `mime_type`.
 * - `URL` → block with `uri` set to the URL string verbatim. Files API URIs
 *   (e.g. `https://generativelanguage.googleapis.com/v1beta/files/<id>`) and
 *   YouTube URLs are passed through the same way.
 */
function convertFilePartToContent({
  part,
  warnings,
  mediaResolution,
}: {
  part: LanguageModelV3FilePart;
  warnings: Array<SharedV3Warning>;
  mediaResolution?: GoogleInteractionsMediaResolution;
}): GoogleInteractionsContent | undefined {
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

  const resolutionField =
    mediaResolution != null && (kind === 'image' || kind === 'video')
      ? { resolution: mediaResolution }
      : {};

  if (part.data instanceof URL) {
    return {
      type: kind,
      uri: part.data.toString(),
      ...(isFullMediaType(part.mediaType) ? { mime_type: part.mediaType } : {}),
      ...resolutionField,
    };
  }

  if (!isFullMediaType(part.mediaType)) {
    warnings.push({
      type: 'other',
      message: `google.interactions: inline file data requires a full IANA media type (e.g. "image/png"), got "${part.mediaType}"; part dropped.`,
    });
    return undefined;
  }

  return {
    type: kind,
    data: convertToBase64(part.data),
    mime_type: part.mediaType,
    ...resolutionField,
  };
}

/*
 * Drops assistant messages that were part of the linked interaction
 * (`previousInteractionId`). Tool-result turns whose tool-call counterpart
 * was dropped are also pruned to keep the message stream well-formed.
 */
function compactPromptForPreviousInteraction({
  prompt,
  previousInteractionId,
}: {
  prompt: LanguageModelV3Prompt;
  previousInteractionId: string;
}): LanguageModelV3Prompt {
  const out: LanguageModelV3Prompt = [];
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
  output: LanguageModelV3ToolResultOutput;
  signature: string | undefined;
  warnings: Array<SharedV3Warning>;
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
        } else if (item.type === 'image-data') {
          const imageBlock = filePartToImageBlock({
            part: {
              type: 'file',
              mediaType: item.mediaType,
              data: item.data,
            },
            warnings,
          });
          if (imageBlock != null) {
            blocks.push(imageBlock);
          }
        } else if (item.type === 'image-url') {
          const imageBlock = filePartToImageBlock({
            part: {
              type: 'file',
              mediaType: 'image/*',
              data: new URL(item.url),
            },
            warnings,
          });
          if (imageBlock != null) {
            blocks.push(imageBlock);
          }
        } else if (item.type === 'file-data' || item.type === 'file-url') {
          const mediaType =
            item.type === 'file-data' ? item.mediaType : 'application/*';
          const topLevel = getTopLevelMediaType(mediaType);
          if (topLevel !== 'image') {
            warnings.push({
              type: 'other',
              message: `google.interactions: tool-result file with mediaType "${mediaType}" is not supported (Interactions \`function_result.result\` accepts only text and image content); part dropped.`,
            });
            continue;
          }
          const imageBlock = filePartToImageBlock({
            part:
              item.type === 'file-data'
                ? {
                    type: 'file',
                    mediaType: item.mediaType,
                    data: item.data,
                  }
                : {
                    type: 'file',
                    mediaType,
                    data: new URL(item.url),
                  },
            warnings,
          });
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
    data: Uint8Array | string | URL;
    filename?: string;
  };
  warnings: Array<SharedV3Warning>;
}): GoogleInteractionsImageContent | undefined {
  if (part.data instanceof URL) {
    return {
      type: 'image',
      uri: part.data.toString(),
      ...(isFullMediaType(part.mediaType) ? { mime_type: part.mediaType } : {}),
    };
  }

  if (!isFullMediaType(part.mediaType)) {
    warnings.push({
      type: 'other',
      message: `google.interactions: tool-result image part requires a full IANA media type (e.g. "image/png"), got "${part.mediaType}"; part dropped.`,
    });
    return undefined;
  }

  return {
    type: 'image',
    data: convertToBase64(part.data),
    mime_type: part.mediaType,
  };
}

/*
 * Collapses runs of adjacent text content blocks within a single user step
 * into one combined text block, separated by a blank line. Text blocks
 * carrying `annotations` are left untouched (annotations are tied to specific
 * text spans).
 */
function mergeAdjacentTextContent(
  content: Array<GoogleInteractionsContentBlock>,
): Array<GoogleInteractionsContentBlock> {
  if (content.length < 2) {
    return content;
  }
  const result: Array<GoogleInteractionsContentBlock> = [];
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
