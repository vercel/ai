import { isDeepStrictEqual } from 'node:util';
import type { PiSessionEvent } from '../../../../packages/harness-pi/src/pi-events';
import {
  createPiTranslatorState,
  translatePiEvent,
  type PiTranslatorState,
} from '../../../../packages/harness-pi/src/pi-translate';

const FAILURE_SIGNAL =
  'ISSUE_22414_REPRODUCED: harness-pi loses or emits non-JSON-safe tool results';

class ReproductionFailure extends Error {}

function translateToolResult({
  event,
  state = createPiTranslatorState(),
}: {
  event: PiSessionEvent;
  state?: PiTranslatorState;
}) {
  translatePiEvent({ type: 'turn_start' }, state);
  translatePiEvent(
    {
      type: 'tool_execution_start',
      toolCallId: event.toolCallId,
      toolName: event.toolName,
      args: {},
    },
    state,
  );

  const [translated] = translatePiEvent(event, state);
  if (translated?.type !== 'tool-result') {
    throw new Error(`Expected one tool-result event for ${event.toolCallId}`);
  }
  return translated;
}

function jsonRoundTrip(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}

async function main() {
  const failures: string[] = [];
  const check = (condition: boolean, message: string) => {
    if (!condition) failures.push(message);
  };

  for (const text of ['', 'native output']) {
    const source = {
      content: [{ type: 'text', text }],
      details: undefined,
    };
    const translated = translateToolResult({
      event: {
        type: 'tool_execution_end',
        toolCallId: `text-${text.length}`,
        toolName: 'ls',
        result: source,
      },
    });

    check(
      translated.result === text,
      `text ${JSON.stringify(text)} was not projected to the exact string`,
    );
    check(
      isDeepStrictEqual(jsonRoundTrip(translated), translated),
      `text ${JSON.stringify(text)} produced a non-JSON-safe event`,
    );
    check(
      Object.hasOwn(source, 'details') && source.details === undefined,
      `text ${JSON.stringify(text)} mutated the native result`,
    );
  }

  for (const isError of [false, true]) {
    const source = {
      content: [{ type: 'text', text: 'partial output' }],
      details: { truncated: true, nextOffset: 20 },
    };
    const translated = translateToolResult({
      event: {
        type: 'tool_execution_end',
        toolCallId: `details-${isError}`,
        toolName: 'grep',
        result: source,
        isError,
      },
    });

    check(
      translated.result === source,
      `meaningful details were discarded (isError=${isError})`,
    );
    check(
      ('isError' in translated ? translated.isError === true : false) ===
        isError,
      `error status changed (isError=${isError})`,
    );
  }

  const imageContent = [{ type: 'image', data: 'AA==', mimeType: 'image/png' }];
  const imageSource = { content: imageContent, details: undefined };
  const imageResult = translateToolResult({
    event: {
      type: 'tool_execution_end',
      toolCallId: 'image',
      toolName: 'read',
      result: imageSource,
    },
  });
  check(
    isDeepStrictEqual(imageResult.result, { content: imageContent }),
    'native image content was not preserved in a JSON-safe envelope',
  );
  check(
    isDeepStrictEqual(jsonRoundTrip(imageResult), imageResult),
    'native image result produced a non-JSON-safe event',
  );
  check(
    Object.hasOwn(imageSource, 'details') && imageSource.details === undefined,
    'native image source was mutated',
  );

  const mixedContent = [
    { type: 'text', text: 'caption' },
    { type: 'image', data: 'AA==', mimeType: 'image/png' },
  ];
  const mixedResult = translateToolResult({
    event: {
      type: 'tool_execution_end',
      toolCallId: 'mixed',
      toolName: 'read',
      result: { content: mixedContent, details: undefined },
    },
  });
  check(
    isDeepStrictEqual(mixedResult.result, { content: mixedContent }),
    'mixed text and image content was flattened and the image was discarded',
  );

  const emptyContentResult = translateToolResult({
    event: {
      type: 'tool_execution_end',
      toolCallId: 'empty-content',
      toolName: 'read',
      result: { content: [], details: undefined },
    },
  });
  check(
    isDeepStrictEqual(emptyContentResult.result, { content: [] }),
    'empty content array was not retained as a JSON-safe envelope',
  );

  const extendedSource = {
    content: [{ type: 'text', text: 'done' }],
    details: undefined,
    terminate: true,
  };
  const extendedResult = translateToolResult({
    event: {
      type: 'tool_execution_end',
      toolCallId: 'extended',
      toolName: 'bash',
      result: extendedSource,
    },
  });
  check(
    isDeepStrictEqual(extendedResult.result, {
      content: extendedSource.content,
      terminate: true,
    }),
    'additional native envelope fields were discarded',
  );

  const flatContent = [{ type: 'text', text: '' }];
  const flatResult = translateToolResult({
    event: {
      type: 'tool_result',
      toolCallId: 'flat',
      toolName: 'ls',
      content: flatContent,
      details: undefined,
    },
  });
  check(
    flatResult.result === '',
    'flat tool_result empty text was not projected to the exact string',
  );
  check(
    isDeepStrictEqual(jsonRoundTrip(flatResult), flatResult),
    'flat tool_result empty text produced a non-JSON-safe event',
  );

  const hostState = createPiTranslatorState({ hostToolNames: ['deploy'] });
  const hostValue = {
    exact: true,
    intentionallyUndefined: undefined,
  };
  hostState.hostToolResults.set('host', hostValue);
  const hostResult = translateToolResult({
    state: hostState,
    event: {
      type: 'tool_execution_end',
      toolCallId: 'host',
      toolName: 'deploy',
      result: {
        content: [{ type: 'text', text: 'Pi projection' }],
        details: undefined,
      },
    },
  });
  check(
    hostResult.result === hostValue,
    'host-submitted tool result lost its exact cached value',
  );

  if (failures.length > 0) {
    throw new ReproductionFailure(
      `${FAILURE_SIGNAL}\n- ${failures.join('\n- ')}`,
    );
  }

  console.log('Issue #22414 behavior is fixed.');
}

main().catch(error => {
  if (error instanceof ReproductionFailure) {
    console.error(error.message);
  } else {
    console.error(error);
  }
  process.exitCode = 1;
});
