import { describe, it, expect, vi } from 'vitest';
import { getMeter } from './get-meter';
import { noopMeter } from './noop-meter';

describe('getMeter', () => {
  it('should return noopMeter when isEnabled is false', () => {
    const meter = getMeter({ isEnabled: false });
    expect(meter).toBe(noopMeter);
  });

  it('should return noopMeter when isEnabled is undefined', () => {
    const meter = getMeter({});
    expect(meter).toBe(noopMeter);
  });

  it('should return noopMeter when called with no options', () => {
    const meter = getMeter();
    expect(meter).toBe(noopMeter);
  });

  it('should return custom meter when provided and isEnabled is true', () => {
    const custom_meter = {
      createCounter: vi.fn(),
      createHistogram: vi.fn(),
      createUpDownCounter: vi.fn(),
      createGauge: vi.fn(),
      createObservableGauge: vi.fn(),
      createObservableCounter: vi.fn(),
      createObservableUpDownCounter: vi.fn(),
      addBatchObservableCallback: vi.fn(),
      removeBatchObservableCallback: vi.fn(),
    } as any;

    const meter = getMeter({ isEnabled: true, meter: custom_meter });
    expect(meter).toBe(custom_meter);
  });

  it('should return noopMeter when isEnabled is false even with custom meter', () => {
    const custom_meter = {
      createCounter: vi.fn(),
    } as any;

    const meter = getMeter({ isEnabled: false, meter: custom_meter });
    expect(meter).toBe(noopMeter);
  });
});
