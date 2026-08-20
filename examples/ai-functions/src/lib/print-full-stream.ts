import type {
  ProviderMetadata,
  ReasoningOutput,
  StreamTextResult,
  TextStreamPart,
  ToolSet,
} from 'ai';

type LifecycleCallback<PART> = (part: PART) => void | PromiseLike<void>;

export type PrintFullStreamText = {
  type: 'text';
  text: string;
  providerMetadata?: ProviderMetadata;
};

export type PrintFullStreamCallbacks<TOOLS extends ToolSet> = {
  onReasoning?: LifecycleCallback<ReasoningOutput>;
  onToolCall?: LifecycleCallback<
    Extract<TextStreamPart<TOOLS>, { type: 'tool-call' }>
  >;
  onToolApproval?: LifecycleCallback<
    Extract<TextStreamPart<TOOLS>, { type: 'tool-approval-request' }>
  >;
  onText?: LifecycleCallback<PrintFullStreamText>;
};

export async function printFullStream<TOOLS extends ToolSet>({
  result,
  onReasoning,
  onToolCall,
  onToolApproval,
  onText,
}: {
  result: StreamTextResult<TOOLS, any, any>;
} & PrintFullStreamCallbacks<TOOLS>) {
  const activeReasoning = new Map<string, ReasoningOutput>();
  const activeText = new Map<string, PrintFullStreamText>();

  for await (const chunk of result.stream) {
    switch (chunk.type) {
      case 'tool-call': {
        console.log(
          `\n\x1b[32m\x1b[1mTOOL CALL\x1b[22m\n${JSON.stringify(chunk, null, 2)}\x1b[0m`,
        );
        await onToolCall?.(chunk);
        break;
      }

      case 'tool-approval-request': {
        console.log(
          `\n\x1b[33m\x1b[1mTOOL APPROVAL REQUEST\x1b[22m\n${JSON.stringify(chunk, null, 2)}\x1b[0m`,
        );
        await onToolApproval?.(chunk);
        break;
      }

      case 'tool-approval-response': {
        console.log(
          `\n\x1b[33m\x1b[1mTOOL APPROVAL RESPONSE\x1b[22m\n${JSON.stringify(chunk, null, 2)}\x1b[0m`,
        );
        break;
      }

      case 'tool-result': {
        console.log(
          `\n\x1b[32m\x1b[1mTOOL RESULT\x1b[22m\n${JSON.stringify(chunk, null, 2)}\x1b[0m`,
        );
        break;
      }

      case 'reasoning-start': {
        activeReasoning.set(chunk.id, {
          type: 'reasoning',
          text: '',
          ...(chunk.providerMetadata != null
            ? { providerMetadata: chunk.providerMetadata }
            : {}),
        });
        process.stdout.write('\n\n\x1b[34m\x1b[1mREASONING\x1b[22m\n');
        break;
      }

      case 'text-start': {
        activeText.set(chunk.id, {
          type: 'text',
          text: '',
          ...(chunk.providerMetadata != null
            ? { providerMetadata: chunk.providerMetadata }
            : {}),
        });
        process.stdout.write('\n\n\x1b[1mTEXT\x1b[22m\n');
        break;
      }

      case 'text-delta': {
        const text = activeText.get(chunk.id);
        if (text != null) {
          text.text += chunk.text;
          if (chunk.providerMetadata != null) {
            text.providerMetadata = chunk.providerMetadata;
          }
        }
        process.stdout.write(chunk.text);
        break;
      }

      case 'reasoning-delta': {
        const reasoning = activeReasoning.get(chunk.id);
        if (reasoning != null) {
          reasoning.text += chunk.text;
          if (chunk.providerMetadata != null) {
            reasoning.providerMetadata = chunk.providerMetadata;
          }
        }
        process.stdout.write(chunk.text);
        break;
      }

      case 'text-end': {
        process.stdout.write('\x1b[0m\n');
        const text = activeText.get(chunk.id);
        if (text != null) {
          if (chunk.providerMetadata != null) {
            text.providerMetadata = chunk.providerMetadata;
          }
          activeText.delete(chunk.id);
          await onText?.(text);
        }
        break;
      }

      case 'reasoning-end': {
        process.stdout.write('\x1b[0m\n');
        const reasoning = activeReasoning.get(chunk.id);
        if (reasoning != null) {
          if (chunk.providerMetadata != null) {
            reasoning.providerMetadata = chunk.providerMetadata;
          }
          activeReasoning.delete(chunk.id);
          await onReasoning?.(reasoning);
        }
        break;
      }

      case 'error':
        console.error(
          `\n\x1b[31m\x1b[1mERROR\x1b[22m\n${formatStreamError(chunk.error)}\x1b[0m`,
        );
        break;
    }
  }
}

function formatStreamError(error: unknown): string {
  if (error instanceof Error) {
    return JSON.stringify(
      {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
      null,
      2,
    );
  }
  return JSON.stringify(error, null, 2);
}
