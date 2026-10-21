import { describe, expect, it } from 'vitest';
import { ElevenLabsDialogueMarkerParser } from './elevenlabs-dialogue-markers';

describe('ElevenLabsDialogueMarkerParser', () => {
  it('assigns text before any marker to the first voice', () => {
    const parser = new ElevenLabsDialogueMarkerParser(['a', 'b']);
    expect(parser.push('Hello there. ')).toEqual([
      { text: 'Hello there. ', voiceId: 'a', newTurn: false },
    ]);
  });

  it('switches voices and starts a new turn at each marker', () => {
    const parser = new ElevenLabsDialogueMarkerParser(['a', 'b']);
    expect(
      parser.push('[[voice:a]]Hi. [[voice:b]]Hey! [[voice:a]]Bye.'),
    ).toEqual([
      { text: 'Hi. ', voiceId: 'a', newTurn: true },
      { text: 'Hey! ', voiceId: 'b', newTurn: true },
      { text: 'Bye.', voiceId: 'a', newTurn: true },
    ]);
  });

  it('handles markers split across deltas', () => {
    const parser = new ElevenLabsDialogueMarkerParser(['a', 'b']);
    const segments = [
      ...parser.push('One. [['),
      ...parser.push('voi'),
      ...parser.push('ce:b'),
      ...parser.push(']]Two.'),
      ...parser.flush(),
    ];
    expect(segments).toEqual([
      { text: 'One. ', voiceId: 'a', newTurn: false },
      { text: 'Two.', voiceId: 'b', newTurn: true },
    ]);
  });

  it('keeps ElevenLabs audio tags (single brackets) as text', () => {
    const parser = new ElevenLabsDialogueMarkerParser(['a']);
    expect([...parser.push('[laughs] ok ['), ...parser.flush()]).toEqual([
      { text: '[laughs] ok ', voiceId: 'a', newTurn: false },
      { text: '[', voiceId: 'a', newTurn: false },
    ]);
  });

  it('emits an unterminated marker as text at end of input', () => {
    const parser = new ElevenLabsDialogueMarkerParser(['a']);
    expect([...parser.push('end [[voice:a'), ...parser.flush()]).toEqual([
      { text: 'end ', voiceId: 'a', newTurn: false },
      { text: '[[voice:a', voiceId: 'a', newTurn: false },
    ]);
  });

  it('rejects markers for unregistered voices', () => {
    const parser = new ElevenLabsDialogueMarkerParser(['a']);
    expect(() => parser.push('[[voice:z]]Hi')).toThrow(
      'ElevenLabs dialogue marker references unregistered voice "z"',
    );
  });
});
