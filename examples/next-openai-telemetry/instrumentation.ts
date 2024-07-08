import { registerOTel } from '@vercel/otel';
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-node';

export function register() {
  registerOTel({
    serviceName: 'next-app',
    traceExporter: new ConsoleSpanExporter(), // TODO what exporter should I use here?
  });
}
