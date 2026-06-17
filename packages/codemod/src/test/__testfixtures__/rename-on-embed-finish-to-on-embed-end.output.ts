import type { Telemetry } from 'ai';

const telemetry: Telemetry = {
  onEmbedEnd(event) {
    console.log(event);
  },
};

const eventType = 'onEmbedEnd';
