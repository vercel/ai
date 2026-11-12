import {
  convertUint8ArrayToBase64,
  type ToolSet,
  type UserModelMessage,
} from '@ai-sdk/provider-utils';
import type { TextStreamPart } from '../generate-text/stream-text-result';
import { getToolCallInputSchemaInput } from '../generate-text/tool-call';
import { convertDataContentToBase64String } from '../prompt/data-content';
import { convertToLanguageModelV4FilePart } from '../prompt/file-part-data';
import type {
  FileUIPart,
  InferUIMessageData,
  InferUIMessageMetadata,
  TextUIPart,
  UIMessage,
} from '../ui/ui-messages';
import { isDeepEqualData } from '../util/is-deep-equal-data';
import { getModelToolErrorText } from './get-model-tool-error-text';
import type { InferUIMessageChunk, UIMessageChunk } from './ui-message-chunks';

export type ToUIMessageChunkOptions<
  TOOLS extends ToolSet = ToolSet,
  UI_MESSAGE extends UIMessage = UIMessage,
> = {
  tools?: TOOLS;
  sendReasoning?: boolean;
  sendSources?: boolean;
  sendStart?: boolean;
  sendFinish?: boolean;
  /**
   * Formats stream errors. Also formats invalid tool calls and
   * application-executed tool errors when `redactToolErrors` is enabled.
   * Provider-executed tool execution errors bypass this callback so their
   * original error data survives model-message round trips.
   */
  onError?: (error: unknown) => string;
  /**
   * Replace the error text of failed tool calls with the result of `onError`.
   * Defaults to `true` when `onError` is provided and to `false` otherwise.
   */
  redactToolErrors?: boolean;
  messageMetadata?: InferUIMessageMetadata<UI_MESSAGE>;
  responseMessageId?: string;
};

/**
 * Converts a single `TextStreamPart` (as emitted by `streamText`'s
 * `stream`) into a `UIMessageChunk`.
 *
 * Returns `undefined` for stream parts that do not produce UI message chunks.
 */
export function toUIMessageChunk<
  TOOLS extends ToolSet = ToolSet,
  UI_MESSAGE extends UIMessage = UIMessage,
>(
  part: TextStreamPart<TOOLS>,
  {
    tools,
    sendReasoning = true,
    sendSources = false,
    sendStart = true,
    sendFinish = true,
    onError: onErrorOption,
    // an existing `onError` keeps handling tool errors, as it did before
    // tool errors stopped being redacted by default
    redactToolErrors = onErrorOption != null,
    messageMetadata,
    responseMessageId,
  }: ToUIMessageChunkOptions<TOOLS, UI_MESSAGE> = {},
): InferUIMessageChunk<UI_MESSAGE> | undefined {
  // Stream errors never reach the model, so they are masked by default.
  const onError = onErrorOption ?? (() => 'An error occurred.');

  // The error text of a failed tool call is not altered by default.
  //
  // The model has already received this text (`getErrorMessage(error)`, see
  // `createToolModelOutput`) and may have reasoned about it and repeated it in
  // its answer. The UI message is the record that `convertToModelMessages`
  // sends back to the model on the next request. Replacing the text here
  //
  // - changes the message history after the fact. Models that bind reasoning
  //   to the preceding messages (for example Anthropic models with preserved
  //   thinking) reject such a history, and other models continue from an
  //   error that they never received.
  // - does not keep the text from the client, because the model's reasoning
  //   and answer are sent to the client as well.
  //
  // To keep error details away from the model and the client, throw a safe
  // error from the tool's `execute` function. `redactToolErrors` restores the
  // replacement for applications that need it.
  //
  // ADR: contributing/decisions/2026-11-12-keep-tool-error-text-unchanged-in-ui-messages.md
  const getToolErrorText = (error: unknown) =>
    redactToolErrors
      ? onError(error)
      : (getModelToolErrorText(error) ?? onError(error));

  // TODO simplify once dynamic is no longer needed for invalid tool inputs
  const isDynamic = (toolPart: { toolName: string; dynamic?: boolean }) => {
    const tool = tools?.[toolPart.toolName];

    // provider-executed, dynamic tools are not listed in the tools object
    if (tool == null) {
      return toolPart.dynamic;
    }

    return tool?.type === 'dynamic' ? true : undefined;
  };

  const partType = part.type;
  switch (partType) {
    case 'text-start': {
      return {
        type: 'text-start',
        id: part.id,
        ...(part.providerMetadata != null
          ? { providerMetadata: part.providerMetadata }
          : {}),
      };
    }

    case 'text-delta': {
      return {
        type: 'text-delta',
        id: part.id,
        delta: part.text,
        ...(part.providerMetadata != null
          ? { providerMetadata: part.providerMetadata }
          : {}),
      };
    }

    case 'text-end': {
      return {
        type: 'text-end',
        id: part.id,
        ...(part.citations != null ? { citations: part.citations } : {}),
        ...(part.providerMetadata != null
          ? { providerMetadata: part.providerMetadata }
          : {}),
      };
    }

    case 'reasoning-start':
    case 'reasoning-end': {
      if (!sendReasoning) {
        return undefined;
      }

      return {
        type: partType,
        id: part.id,
        ...(part.providerMetadata != null
          ? { providerMetadata: part.providerMetadata }
          : {}),
      };
    }

    case 'reasoning-delta': {
      if (!sendReasoning) {
        return undefined;
      }

      return {
        type: 'reasoning-delta',
        id: part.id,
        delta: part.text,
        ...(part.providerMetadata != null
          ? { providerMetadata: part.providerMetadata }
          : {}),
      };
    }

    case 'file':
    case 'reasoning-file': {
      if (partType === 'reasoning-file' && !sendReasoning) {
        return undefined;
      }

      return {
        type: part.type,
        mediaType: part.file.mediaType,
        url: `data:${part.file.mediaType};base64,${part.file.base64}`,
        ...(part.providerMetadata != null
          ? { providerMetadata: part.providerMetadata }
          : {}),
      };
    }

    case 'source': {
      if (!sendSources) {
        return undefined;
      }

      if (part.sourceType === 'url') {
        return {
          type: 'source-url',
          sourceId: part.id,
          url: part.url,
          title: part.title,
          ...(part.providerMetadata != null
            ? { providerMetadata: part.providerMetadata }
            : {}),
        };
      }

      if (part.sourceType === 'document') {
        return {
          type: 'source-document',
          sourceId: part.id,
          mediaType: part.mediaType,
          title: part.title,
          filename: part.filename,
          ...(part.providerMetadata != null
            ? { providerMetadata: part.providerMetadata }
            : {}),
        };
      }

      return undefined;
    }

    case 'custom': {
      return {
        type: 'custom',
        kind: part.kind,
        ...(part.providerMetadata != null
          ? { providerMetadata: part.providerMetadata }
          : {}),
      };
    }

    case 'tool-input-start': {
      const dynamic = isDynamic(part);

      return {
        type: 'tool-input-start',
        toolCallId: part.id,
        toolName: part.toolName,
        ...(part.inputEncoding != null
          ? { inputEncoding: part.inputEncoding }
          : {}),
        ...(part.providerExecuted != null
          ? { providerExecuted: part.providerExecuted }
          : {}),
        ...(part.providerMetadata != null
          ? { providerMetadata: part.providerMetadata }
          : {}),
        ...(part.toolMetadata != null
          ? { toolMetadata: part.toolMetadata }
          : {}),
        ...(dynamic != null ? { dynamic } : {}),
        ...(part.title != null ? { title: part.title } : {}),
      };
    }

    case 'tool-input-delta': {
      return {
        type: 'tool-input-delta',
        toolCallId: part.id,
        inputTextDelta: part.delta,
      };
    }

    case 'tool-call': {
      const dynamic = isDynamic(part);

      if (part.invalid) {
        return {
          type: 'tool-input-error',
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          input: part.input,
          ...(part.providerExecuted != null
            ? { providerExecuted: part.providerExecuted }
            : {}),
          ...(part.providerMetadata != null
            ? { providerMetadata: part.providerMetadata }
            : {}),
          ...(part.toolMetadata != null
            ? { toolMetadata: part.toolMetadata }
            : {}),
          ...(dynamic != null ? { dynamic } : {}),
          // streamText sends the model a tool result for an invalid tool call
          // only when the tool is not provider-executed
          errorText: part.providerExecuted
            ? onError(part.error)
            : getToolErrorText(part.error),
          ...(part.title != null ? { title: part.title } : {}),
        };
      }

      return {
        type: 'tool-input-available',
        toolCallId: part.toolCallId,
        toolName: part.toolName,
        input: part.input,
        ...(part.providerExecuted != null
          ? { providerExecuted: part.providerExecuted }
          : {}),
        ...(part.providerMetadata != null
          ? { providerMetadata: part.providerMetadata }
          : {}),
        ...(part.toolMetadata != null
          ? { toolMetadata: part.toolMetadata }
          : {}),
        ...(dynamic != null ? { dynamic } : {}),
        ...(part.title != null ? { title: part.title } : {}),
      };
    }

    case 'tool-approval-request': {
      const inputSchemaInput = getToolCallInputSchemaInput(part.toolCall);
      return {
        type: 'tool-approval-request',
        approvalId: part.approvalId,
        toolCallId: part.toolCall.toolCallId,
        ...(inputSchemaInput != null &&
        !isDeepEqualData(inputSchemaInput.value, part.toolCall.input)
          ? { inputSchemaInput: inputSchemaInput.value }
          : {}),
        ...(part.reason != null ? { reason: part.reason } : {}),
        ...(part.isAutomatic != null ? { isAutomatic: part.isAutomatic } : {}),
        ...(part.signature != null ? { signature: part.signature } : {}),
      };
    }

    case 'tool-approval-response': {
      return {
        type: 'tool-approval-response',
        approvalId: part.approvalId,
        approved: part.approved,
        ...(part.reason != null ? { reason: part.reason } : {}),
        ...(part.providerExecuted != null
          ? { providerExecuted: part.providerExecuted }
          : {}),
      };
    }

    case 'tool-result': {
      const dynamic = isDynamic(part);

      return {
        type: 'tool-output-available',
        toolCallId: part.toolCallId,
        // UI stream chunks are serialized as JSON, which drops undefined
        // properties. Use null so tool outputs always keep the output field.
        output: part.output === undefined ? null : part.output,
        ...(part.providerExecuted != null
          ? { providerExecuted: part.providerExecuted }
          : {}),
        ...(part.providerMetadata != null
          ? { providerMetadata: part.providerMetadata }
          : {}),
        ...(part.toolMetadata != null
          ? { toolMetadata: part.toolMetadata }
          : {}),
        ...(part.preliminary != null ? { preliminary: part.preliminary } : {}),
        ...(dynamic != null ? { dynamic } : {}),
      };
    }

    case 'tool-error': {
      const dynamic = isDynamic(part);

      // Preserve provider error codes for model-message round trips and harness
      // runtime error messages. Provider-executed execution errors always
      // bypass onError. Application-executed errors keep the text that the
      // model received unless tool errors are redacted (see getToolErrorText).
      return {
        type: 'tool-output-error',
        toolCallId: part.toolCallId,
        errorText: part.providerExecuted
          ? typeof part.error === 'string'
            ? part.error
            : JSON.stringify(part.error)
          : getToolErrorText(part.error),
        ...(part.providerExecuted != null
          ? { providerExecuted: part.providerExecuted }
          : {}),
        ...(part.providerMetadata != null
          ? { providerMetadata: part.providerMetadata }
          : {}),
        ...(part.toolMetadata != null
          ? { toolMetadata: part.toolMetadata }
          : {}),
        ...(dynamic != null ? { dynamic } : {}),
      };
    }

    case 'tool-output-denied': {
      return {
        type: 'tool-output-denied',
        toolCallId: part.toolCallId,
      };
    }

    case 'error': {
      return {
        type: 'error',
        errorText: onError(part.error),
      };
    }

    case 'steering-message': {
      return {
        type: 'steering-message',
        id: part.id,
        parts: convertUserMessageToUIParts(part.message),
      };
    }

    case 'start-step': {
      return { type: 'start-step' };
    }

    case 'finish-step': {
      return { type: 'finish-step' };
    }

    case 'start': {
      if (!sendStart) {
        return undefined;
      }

      return {
        type: 'start',
        ...(messageMetadata != null ? { messageMetadata } : {}),
        ...(responseMessageId != null ? { messageId: responseMessageId } : {}),
      } as UIMessageChunk<
        InferUIMessageMetadata<UI_MESSAGE>,
        InferUIMessageData<UI_MESSAGE>
      >;
    }

    case 'finish': {
      if (!sendFinish) {
        return undefined;
      }

      return {
        type: 'finish',
        finishReason: part.finishReason,
        ...(messageMetadata != null ? { messageMetadata } : {}),
      } as UIMessageChunk<
        InferUIMessageMetadata<UI_MESSAGE>,
        InferUIMessageData<UI_MESSAGE>
      >;
    }

    case 'abort': {
      return part;
    }

    case 'tool-input-end':
    case 'ping':
    case 'raw': {
      return undefined;
    }

    default: {
      const exhaustiveCheck: never = partType;
      throw new Error(`Unknown chunk type: ${exhaustiveCheck}`);
    }
  }
}

function convertUserMessageToUIParts(
  message: UserModelMessage,
): Array<TextUIPart | FileUIPart> {
  if (typeof message.content === 'string') {
    return [{ type: 'text', text: message.content }];
  }

  return message.content.map((part): TextUIPart | FileUIPart => {
    const providerMetadata =
      part.providerOptions != null
        ? { providerMetadata: part.providerOptions }
        : {};

    if (part.type === 'text') {
      return { type: 'text', text: part.text, ...providerMetadata };
    }

    const { data, mediaType: dataUrlMediaType } =
      convertToLanguageModelV4FilePart(
        part.type === 'image' ? part.image : part.data,
      );
    const mediaType = dataUrlMediaType ?? part.mediaType ?? 'image';
    const filename = part.type === 'file' ? part.filename : undefined;
    const file = {
      type: 'file' as const,
      mediaType,
      ...(filename != null ? { filename } : {}),
      ...providerMetadata,
    };

    switch (data.type) {
      case 'url': {
        return { ...file, url: data.url.toString() };
      }
      case 'data': {
        return {
          ...file,
          url: `data:${mediaType};base64,${convertDataContentToBase64String(data.data)}`,
        };
      }
      case 'text': {
        return {
          ...file,
          url: `data:${mediaType};base64,${convertUint8ArrayToBase64(new TextEncoder().encode(data.text))}`,
        };
      }
      case 'reference': {
        // the provider reference takes precedence over the url in model messages:
        return { ...file, url: '', providerReference: data.reference };
      }
    }
  });
}
