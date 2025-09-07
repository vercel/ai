import { metrics } from '@opentelemetry/api';
import { completionCounter, completionLatency, completionTokens, recordCompletion } from './telemetry';

describe('Telemetry', () => {
  beforeEach(() => {
    // Reset metrics before each test
    metrics.getMeter('ai-operations').clear();
  });

  it('should record completion metrics', () => {
    // Record a successful completion
    recordCompletion(100, 50, 'success');

    // Get the current values
    const counterValue = completionCounter.bind({ status: 'success' }).value;
    const latencyValue = completionLatency.bind({ status: 'success' }).value;
    const tokensValue = completionTokens.bind({ status: 'success' }).value;

    // Assert the metrics were recorded correctly
    expect(counterValue).toBe(1);
    expect(latencyValue).toBeDefined();
    expect(tokensValue).toBeDefined();
  });

  it('should record error metrics', () => {
    // Record a failed completion
    recordCompletion(50, 0, 'error');

    // Get the current values
    const counterValue = completionCounter.bind({ status: 'error' }).value;
    const latencyValue = completionLatency.bind({ status: 'error' }).value;
    const tokensValue = completionTokens.bind({ status: 'error' }).value;

    // Assert the metrics were recorded correctly
    expect(counterValue).toBe(1);
    expect(latencyValue).toBeDefined();
    expect(tokensValue).toBeDefined();
  });
}); 