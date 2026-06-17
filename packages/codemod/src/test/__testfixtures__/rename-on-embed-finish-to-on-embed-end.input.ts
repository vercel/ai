import type { Telemetry } from 'ai';

const telemetry: Telemetry = {
  onEmbedFinish(event) {
    console.log(event);
  },
};

const eventType = 'onEmbedFinish';
