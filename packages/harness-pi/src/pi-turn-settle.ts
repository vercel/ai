import type { ExtensionFactory } from '@earendil-works/pi-coding-agent';
import type { PiSessionEvent } from './pi-events';

const PAUSING_REASON =
  'The session is pausing. Continue this work when the turn resumes.';

/**
 * Tracks whether a Pi turn is between model requests, so `doSuspendTurn` can
 * abort it there instead of mid-flight. A tool cut while it runs loses its
 * work, and Pi leaves an aborted assistant message out of the next request, so
 * text the user already saw is regenerated on the next slice. Once a settle
 * has begun, new tool calls are blocked so the turn reaches that point sooner.
 */
export interface PiTurnSettle {
  /** Inline Pi extension that blocks tool calls once a settle has begun. */
  readonly extension: ExtensionFactory;
  /** Observe a session event; the translator's subscription forwards each one. */
  observe(event: PiSessionEvent): void;
  /** Resolves once no tool runs and no assistant message streams, or after the bound. */
  settle(): Promise<void>;
}

export function createPiTurnSettle({
  timeoutMs,
}: {
  timeoutMs: number;
}): PiTurnSettle {
  let runningTools = 0;
  let assistantStreaming = false;
  let pausing = false;
  let notifyIdle: (() => void) | undefined;

  const isIdle = () => runningTools === 0 && !assistantStreaming;

  return {
    extension: pi => {
      pi.on('tool_call', () =>
        pausing ? { block: true, reason: PAUSING_REASON } : undefined,
      );
    },
    observe(event) {
      switch (event.type) {
        case 'tool_execution_start':
          runningTools += 1;
          return;
        case 'tool_execution_end':
          runningTools = Math.max(0, runningTools - 1);
          break;
        case 'message_start':
          if (event.message?.role === 'assistant') assistantStreaming = true;
          return;
        case 'message_end':
          if (event.message?.role !== 'assistant') return;
          assistantStreaming = false;
          break;
        default:
          return;
      }
      if (isIdle()) notifyIdle?.();
    },
    async settle() {
      pausing = true;
      if (isIdle()) return;
      let timer: ReturnType<typeof setTimeout> | undefined;
      await new Promise<void>(resolve => {
        notifyIdle = resolve;
        timer = setTimeout(resolve, timeoutMs);
      });
      clearTimeout(timer);
      notifyIdle = undefined;
    },
  };
}
