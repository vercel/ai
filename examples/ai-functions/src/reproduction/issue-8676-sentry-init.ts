import * as Sentry from '@sentry/node';

const transportState = globalThis as typeof globalThis & {
  issue8676SentryEnvelopes?: unknown[];
};
transportState.issue8676SentryEnvelopes = [];

Sentry.init({
  dsn: 'https://public@example.com/1',
  tracesSampleRate: 1,
  transport: () => ({
    send: async envelope => {
      transportState.issue8676SentryEnvelopes?.push(envelope);
      return { statusCode: 200 };
    },
    flush: async () => true,
  }),
});
