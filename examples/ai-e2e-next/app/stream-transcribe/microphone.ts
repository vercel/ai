/** Capture microphone audio as 24 kHz mono PCM16 chunks. Returns a stop function. */
export async function startMicrophone(onChunk: (chunk: ArrayBuffer) => void) {
  const context = new AudioContext({ sampleRate: 24000 });
  let media: MediaStream | undefined;
  const cleanup = async () => {
    media?.getTracks().forEach(track => track.stop());
    await context.close();
  };

  try {
    await context.resume();
    media = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1 },
    });
    await context.audioWorklet.addModule('/microphone-worklet.js');
    const source = context.createMediaStreamSource(media);
    const recorder = new AudioWorkletNode(context, 'microphone');
    source.connect(recorder);
    recorder.connect(context.destination); // The worklet outputs silence.
    let stopped: (() => void) | undefined;
    recorder.port.onmessage = ({ data }) => {
      if (data === 'stopped') stopped?.();
      else onChunk(data);
    };
    let stopping: Promise<void> | undefined;
    return () =>
      (stopping ??= (async () => {
        source.disconnect();
        // Flush the last partial chunk before releasing the microphone.
        await new Promise<void>(resolve => {
          stopped = resolve;
          recorder.port.postMessage('stop', []);
        });
        recorder.disconnect();
        recorder.port.close();
        await cleanup();
      })());
  } catch (error) {
    await cleanup();
    throw error;
  }
}
