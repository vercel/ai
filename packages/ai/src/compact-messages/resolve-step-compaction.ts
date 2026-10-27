import type { ModelMessage } from '@ai-sdk/provider-utils';
import { cloneModelMessages } from '../prompt/clone-model-message';
import { CompactionError } from './compaction-error';
import type { CompactionCheckpoint, CompactionResult } from './types';
import {
  getPendingToolCalls,
  isValidMessages,
  serializeMessages,
  validateCheckpoint,
} from './validate-compaction';

/** Apply an explicit compaction while keeping ordinary message overrides separate. */
export async function resolveStepCompaction({
  messages,
  checkpoint,
  prepareStepResult,
}: {
  messages: ModelMessage[];
  checkpoint: CompactionCheckpoint | undefined;
  prepareStepResult:
    | { messages?: ModelMessage[]; compaction?: CompactionResult }
    | undefined;
}): Promise<{
  messages: ModelMessage[];
  checkpoint: CompactionCheckpoint | undefined;
  compacted: boolean;
}> {
  const compaction = prepareStepResult?.compaction;
  if (compaction === undefined) {
    return {
      messages: prepareStepResult?.messages ?? messages,
      checkpoint:
        prepareStepResult?.messages === undefined ? checkpoint : undefined,
      compacted: false,
    };
  }

  if (prepareStepResult?.messages !== undefined) {
    throw new CompactionError({
      code: 'INVALID_OPTIONS',
      message: 'prepareStep cannot return both messages and compaction.',
    });
  }
  if (
    compaction == null ||
    typeof compaction.compacted !== 'boolean' ||
    !(await isValidMessages(compaction.messages, getPendingToolCalls(messages)))
  ) {
    throw new CompactionError({
      code: 'INVALID_MESSAGES',
      message: 'prepareStep.compaction must contain valid replacement history.',
    });
  }
  if (
    compaction.compacted !==
    (serializeMessages(compaction.messages) !== serializeMessages(messages))
  ) {
    throw new CompactionError({
      code: 'INVALID_MESSAGES',
      message:
        'prepareStep.compaction.compacted must describe whether the history changed.',
    });
  }
  await validateCheckpoint(compaction.messages, compaction.checkpoint);

  return {
    messages: cloneModelMessages(compaction.messages),
    checkpoint:
      compaction.checkpoint === undefined
        ? undefined
        : { ...compaction.checkpoint },
    compacted: compaction.compacted,
  };
}
