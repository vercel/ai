import { Experimental_GoogleRealtimeModel } from '@ai-sdk/google';
import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import {
  createInitialRealtimeState,
  RealtimeEventReducer,
} from '../../../../packages/ai/src/realtime/realtime-event-reducer';

const failureSignal =
  'ISSUE_21545_USER_MESSAGE_OVERWRITTEN: expected two distinct user transcription messages';

type VisibleMessage = {
  role: 'assistant' | 'user';
  text: string;
};

async function main() {
  const rawEvents = JSON.parse(
    await readFile(
      new URL(
        '../../../../packages/google/src/realtime/__fixtures__/issue-21545-server-events.json',
        import.meta.url,
      ),
      'utf8',
    ),
  ) as unknown[];

  const model = new Experimental_GoogleRealtimeModel('gemini-3.8-live', {
    provider: 'google.realtime',
    baseURL: 'https://generativelanguage.googleapis.com/v1beta',
    headers: () => ({}),
  });
  const reducer = new RealtimeEventReducer();
  let state = createInitialRealtimeState();

  for (const rawEvent of rawEvents) {
    const parsed = model.parseServerEvent(rawEvent);
    for (const event of Array.isArray(parsed) ? parsed : [parsed]) {
      ({ state } = await reducer.reduceServerEvent(state, event));
    }
  }

  const messages = state.messages.map(
    message =>
      ({
        role: message.role,
        text: message.parts
          .filter(part => part.type === 'text')
          .map(part => part.text)
          .join(''),
      }) as VisibleMessage,
  );

  const expected: VisibleMessage[] = [
    { role: 'user', text: 'What time is it?' },
    { role: 'assistant', text: 'It is noon.' },
    { role: 'user', text: 'And the date?' },
    { role: 'assistant', text: 'It is Monday.' },
  ];

  console.log(JSON.stringify({ messages }, null, 2));
  assert.deepEqual(messages, expected, failureSignal);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
