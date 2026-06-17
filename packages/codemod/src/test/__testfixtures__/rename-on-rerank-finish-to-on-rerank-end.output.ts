import type { Telemetry } from 'ai';

const telemetry: Telemetry = {
  onRerankEnd(event) {
    console.log(event);
  },
};

const eventType = 'onRerankEnd';
