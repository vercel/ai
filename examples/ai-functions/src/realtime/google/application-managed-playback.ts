import { google } from '@ai-sdk/google';
import type {
  Experimental_RealtimeServerEvent,
  Experimental_RealtimeSessionOptions,
} from 'ai';

class AvatarAudioSink {
  private playedMilliseconds = 0;

  enqueue(base64PcmAudio: string) {
    // Forward the PCM audio to the avatar or another application-owned output.
    console.log(`queued ${base64PcmAudio.length} base64 characters`);
  }

  stop() {
    console.log('stopped application-managed playback');
  }

  getPositionMs() {
    return this.playedMilliseconds;
  }

  setPositionMs(positionMs: number) {
    this.playedMilliseconds = positionMs;
  }
}

const avatarAudio = new AvatarAudioSink();

const options = {
  model: google.experimental_realtime('gemini-3.1-flash-live-preview'),
  api: { token: '/api/realtime/setup' },
  playback: {
    getPositionMs: () => avatarAudio.getPositionMs(),
  },
  onEvent(event) {
    if (event.type === 'audio-delta') {
      avatarAudio.enqueue(event.delta);
    } else if (event.type === 'speech-started') {
      avatarAudio.stop();
    }
  },
} satisfies Experimental_RealtimeSessionOptions;

// In a browser application, pass `options` to `experimental_useRealtime`.
// This synthetic event keeps the focused example runnable without opening a
// provider session.
avatarAudio.setPositionMs(640);
options.onEvent({
  type: 'audio-delta',
  responseId: 'example-response',
  itemId: 'example-item',
  delta: 'AAAA',
  raw: {},
} satisfies Experimental_RealtimeServerEvent);
console.log(`played ${options.playback.getPositionMs()}ms`);
