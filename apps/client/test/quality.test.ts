import { describe, expect, it } from 'vitest';
import { isIntegratedGpu, pixelRatioFor, QUALITY, slowFramesTip } from '../src/render/quality';

describe('pixelRatioFor', () => {
  it('keeps phones at their preset ratio', () => {
    expect(pixelRatioFor(QUALITY.medium, 390, 844, 3)).toBe(1.5);
    expect(pixelRatioFor(QUALITY.high, 390, 844, 3)).toBe(2);
  });

  it('lowers the ratio of large HiDPI screens to the pixel budget', () => {
    const r = pixelRatioFor(QUALITY.high, 1728, 1117, 2);
    expect(r).toBeLessThan(2);
    expect(1728 * 1117 * r * r).toBeCloseTo(QUALITY.high.pixelBudget, -3);
  });

  it('never goes below 1 (nor above the device)', () => {
    expect(pixelRatioFor(QUALITY.low, 3840, 2160, 1)).toBe(1);
    expect(pixelRatioFor(QUALITY.high, 800, 600, 1)).toBe(1);
    expect(pixelRatioFor(QUALITY.high, 800, 600, 0.9)).toBe(0.9);
  });

  it('caps integrated GPUs', () => {
    expect(pixelRatioFor(QUALITY.medium, 1280, 800, 2, true)).toBe(1.25);
    expect(isIntegratedGpu('ANGLE (Intel Inc., Intel(R) Iris(TM) Pro Graphics 6200)')).toBe(true);
    expect(isIntegratedGpu('Intel(R) Iris(R) Xe Graphics')).toBe(false);
    expect(isIntegratedGpu('NVIDIA GeForce RTX 3070')).toBe(false);
  });
});

describe('slow frames tip', () => {
  const intel = 'ANGLE (Intel, Intel(R) HD Graphics Direct3D11 vs_5_0 ps_5_0)';
  const nvidia = 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0)';
  it('points at the Intel chip of a PC that may have a gaming card', () => {
    expect(slowFramesTip(intel, 13, 'high')).toBe('gpu');
    expect(slowFramesTip(intel, 45, 'high')).toBeNull();
  });
  it('suggests Auto when a hand-picked preset is too heavy', () => {
    expect(slowFramesTip(nvidia, 15, 'high')).toBe('auto');
    expect(slowFramesTip(nvidia, 15, 'auto')).toBeNull();
    expect(slowFramesTip(nvidia, 15, 'low')).toBeNull();
    expect(slowFramesTip(nvidia, 25, 'high')).toBeNull();
  });
});
