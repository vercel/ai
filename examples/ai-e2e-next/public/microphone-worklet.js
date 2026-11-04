// Collect 100 ms of mono PCM16 at the AudioContext's 24 kHz sample rate.
class MicrophoneProcessor extends AudioWorkletProcessor {
  buffer = new ArrayBuffer(4800);
  offset = 0;
  view = new DataView(this.buffer);
  recording = true;

  constructor() {
    super();
    this.port.onmessage = () => {
      this.recording = false;
      if (this.offset > 0)
        this.port.postMessage(this.buffer.slice(0, this.offset), []);
      this.port.postMessage('stopped', []);
    };
  }

  process(inputs) {
    if (!this.recording) return false;
    const samples = inputs[0]?.[0];
    if (!samples) return true;
    for (const value of samples) {
      const sample = Math.max(-1, Math.min(1, value));
      this.view.setInt16(
        this.offset,
        sample * (sample < 0 ? 32768 : 32767),
        true,
      );
      this.offset += 2;
      if (this.offset === this.buffer.byteLength) {
        this.port.postMessage(this.buffer, [this.buffer]);
        this.buffer = new ArrayBuffer(4800);
        this.view = new DataView(this.buffer);
        this.offset = 0;
      }
    }
    return true;
  }
}

registerProcessor('microphone', MicrophoneProcessor);
