import { Experimental_GoogleRealtimeModel } from '@ai-sdk/google';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  createInitialRealtimeState,
  RealtimeEventReducer,
} from './realtime-event-reducer';

const serverEvents = JSON.parse(
  readFileSync(
    new URL(
      '../../../google/src/realtime/__fixtures__/issue-21545-server-events.json',
      import.meta.url,
    ),
    'utf8',
  ),
) as unknown[];

describe('Google Realtime issue #21545', () => {
  it('preserves both user messages in a two-turn voice conversation', async () => {
    const model = new Experimental_GoogleRealtimeModel('gemini-3.8-live', {
      provider: 'google.realtime',
      baseURL: 'https://generativelanguage.googleapis.com/v1beta',
      headers: () => ({}),
    });
    const reducer = new RealtimeEventReducer();
    let state = createInitialRealtimeState();

    for (const serverEvent of serverEvents) {
      const parsed = model.parseServerEvent(serverEvent);
      for (const event of Array.isArray(parsed) ? parsed : [parsed]) {
        ({ state } = await reducer.reduceServerEvent(state, event));
      }
    }

    expect(
      state.messages.map(message => ({
        role: message.role,
        text: message.parts
          .filter(part => part.type === 'text')
          .map(part => part.text)
          .join(''),
      })),
    ).toEqual([
      { role: 'user', text: 'What time is it?' },
      { role: 'assistant', text: 'It is noon.' },
      { role: 'user', text: 'And the date?' },
      { role: 'assistant', text: 'It is Monday.' },
    ]);
  });
});
