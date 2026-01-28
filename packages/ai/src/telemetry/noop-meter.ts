import {
  Meter,
  Counter,
  Histogram,
  UpDownCounter,
  Gauge,
  ObservableGauge,
  ObservableCounter,
  ObservableUpDownCounter,
  MetricOptions,
  BatchObservableCallback,
  Observable,
} from '@opentelemetry/api';

/**
 * Counter implementation that does nothing (null object).
 */
const noopCounter: Counter = {
  add(_value: number, _attributes?: unknown): void {},
};

/**
 * Histogram implementation that does nothing (null object).
 */
const noopHistogram: Histogram = {
  record(_value: number, _attributes?: unknown): void {},
};

/**
 * UpDownCounter implementation that does nothing (null object).
 */
const noopUpDownCounter: UpDownCounter = {
  add(_value: number, _attributes?: unknown): void {},
};

/**
 * Gauge implementation that does nothing (null object).
 */
const noopGauge: Gauge = {
  record(_value: number, _attributes?: unknown): void {},
};

/**
 * Observable implementation that does nothing (null object).
 */
const noopObservable: Observable = {
  addCallback(_callback: unknown): void {},
  removeCallback(_callback: unknown): void {},
};

/**
 * Meter implementation that does nothing (null object).
 * Used when telemetry is disabled to avoid performance overhead.
 */
export const noopMeter: Meter = {
  createCounter(_name: string, _options?: MetricOptions): Counter {
    return noopCounter;
  },

  createHistogram(_name: string, _options?: MetricOptions): Histogram {
    return noopHistogram;
  },

  createUpDownCounter(
    _name: string,
    _options?: MetricOptions,
  ): UpDownCounter {
    return noopUpDownCounter;
  },

  createGauge(_name: string, _options?: MetricOptions): Gauge {
    return noopGauge;
  },

  createObservableGauge(
    _name: string,
    _options?: MetricOptions,
  ): ObservableGauge {
    return noopObservable as ObservableGauge;
  },

  createObservableCounter(
    _name: string,
    _options?: MetricOptions,
  ): ObservableCounter {
    return noopObservable as ObservableCounter;
  },

  createObservableUpDownCounter(
    _name: string,
    _options?: MetricOptions,
  ): ObservableUpDownCounter {
    return noopObservable as ObservableUpDownCounter;
  },

  addBatchObservableCallback(
    _callback: BatchObservableCallback,
    _observables: Observable[],
  ): void {},

  removeBatchObservableCallback(_callback: BatchObservableCallback): void {},
};
