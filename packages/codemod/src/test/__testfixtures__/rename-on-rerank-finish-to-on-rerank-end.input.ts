import type { Telemetry } from 'ai';

const telemetry: Telemetry = {
  onRerankFinish(event) {
    console.log(event);
  },
};

const eventType = 'onRerankFinish';
