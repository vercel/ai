import { describe, expect, it } from 'vitest';
import { isLinux, isMacOS, isWindows } from './os';

describe('OS utilities', () => {
  it('identifies macOS', () => {
    expect(isMacOS('darwin')).toBe(true);
    expect(isMacOS('linux')).toBe(false);
    expect(isMacOS('win32')).toBe(false);
  });

  it('identifies Linux', () => {
    expect(isLinux('darwin')).toBe(false);
    expect(isLinux('linux')).toBe(true);
    expect(isLinux('win32')).toBe(false);
  });

  it('identifies Windows', () => {
    expect(isWindows('darwin')).toBe(false);
    expect(isWindows('linux')).toBe(false);
    expect(isWindows('win32')).toBe(true);
  });
});
