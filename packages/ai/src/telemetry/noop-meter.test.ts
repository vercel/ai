import { describe, it, expect } from 'vitest';
import { noopMeter } from './noop-meter';

describe('noopMeter', () => {
  it('should create a counter that does nothing', () => {
    const counter = noopMeter.createCounter('test.counter');
    expect(() => counter.add(1)).not.toThrow();
    expect(() => counter.add(10, { key: 'value' })).not.toThrow();
  });

  it('should create a histogram that does nothing', () => {
    const histogram = noopMeter.createHistogram('test.histogram');
    expect(() => histogram.record(100)).not.toThrow();
    expect(() => histogram.record(200, { key: 'value' })).not.toThrow();
  });

  it('should create an up-down counter that does nothing', () => {
    const up_down_counter = noopMeter.createUpDownCounter('test.updown');
    expect(() => up_down_counter.add(1)).not.toThrow();
    expect(() => up_down_counter.add(-1, { key: 'value' })).not.toThrow();
  });

  it('should create a gauge that does nothing', () => {
    const gauge = noopMeter.createGauge('test.gauge');
    expect(() => gauge.record(42)).not.toThrow();
    expect(() => gauge.record(100, { key: 'value' })).not.toThrow();
  });

  it('should create observable instruments that do nothing', () => {
    const observable_gauge = noopMeter.createObservableGauge('test.observable_gauge');
    const observable_counter = noopMeter.createObservableCounter('test.observable_counter');
    const observable_updown = noopMeter.createObservableUpDownCounter('test.observable_updown');

    expect(() => observable_gauge.addCallback(() => {})).not.toThrow();
    expect(() => observable_gauge.removeCallback(() => {})).not.toThrow();
    expect(() => observable_counter.addCallback(() => {})).not.toThrow();
    expect(() => observable_updown.removeCallback(() => {})).not.toThrow();
  });

  it('should handle batch observable callbacks', () => {
    const callback = () => {};
    expect(() => noopMeter.addBatchObservableCallback(callback, [])).not.toThrow();
    expect(() => noopMeter.removeBatchObservableCallback(callback)).not.toThrow();
  });
});
