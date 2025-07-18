import '@testing-library/jest-dom';

// Mock OpenTelemetry API
jest.mock('@opentelemetry/api', () => ({
  metrics: {
    getMeter: () => ({
      createCounter: () => ({
        add: jest.fn(),
        bind: () => ({ value: 1 }),
      }),
      createHistogram: () => ({
        record: jest.fn(),
        bind: () => ({ value: 100 }),
      }),
      clear: jest.fn(),
    }),
    setGlobalMeterProvider: jest.fn(),
  },
  trace: {
    getTracer: () => ({
      startSpan: jest.fn(),
      startActiveSpan: jest.fn(),
    }),
    setGlobalTracerProvider: jest.fn(),
  },
})); 