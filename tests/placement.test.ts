/** The settings window always opens fully on screen. */

import { describe, expect, test } from 'vitest';

import { type FitRequest, fitOnScreen } from '../electron/placement';

// A framed Windows 10 window: 8px invisible borders each side, 31px title bar.
const frame = { width: 16, height: 39 };
const base = { frame, contentWidth: 540, margin: 16 };

function request(overrides: Partial<FitRequest>): FitRequest {
  return {
    ...base,
    area: { x: 0, y: 0, width: 2560, height: 1400 },
    bounds: { x: 0, y: 0, width: 556, height: 679 },
    contentHeight: 955,
    center: true,
    ...overrides,
  };
}

function outer(req: FitRequest, contentHeight: number, x: number, y: number) {
  return { x, y, width: req.contentWidth + frame.width, height: contentHeight + frame.height };
}

function expectInside(req: FitRequest) {
  const fit = fitOnScreen(req);
  const box = outer(req, fit.contentHeight, fit.x, fit.y);
  const a = req.area;
  expect(box.x).toBeGreaterThanOrEqual(a.x);
  expect(box.y).toBeGreaterThanOrEqual(a.y);
  expect(box.x + box.width).toBeLessThanOrEqual(a.x + a.width);
  expect(box.y + box.height).toBeLessThanOrEqual(a.y + a.height);
  return fit;
}

describe('opening', () => {
  test('centres the full form on a tall screen', () => {
    const fit = expectInside(request({}));
    expect(fit).toEqual({ contentHeight: 955, x: Math.round((2560 - 556) / 2), y: Math.round((1400 - 994) / 2) });
  });

  test('caps a form taller than a 1080p screen, leaving a margin', () => {
    const fit = expectInside(request({ area: { x: 0, y: 0, width: 1920, height: 1040 }, contentHeight: 1132 }));
    expect(fit.contentHeight).toBe(1040 - 39 - 2 * 16);
    expect(fit.y).toBe(16);
  });

  test('opens on a second monitor to the right or above', () => {
    expectInside(request({ area: { x: 2560, y: 0, width: 1920, height: 1040 }, contentHeight: 1132 }));
    const fit = expectInside(request({ area: { x: -1920, y: -1080, width: 1920, height: 1040 } }));
    expect(fit.x).toBeLessThan(0);
    expect(fit.y).toBeLessThan(0);
  });

  test('a short form stays its own size', () => {
    expect(expectInside(request({ contentHeight: 300 })).contentHeight).toBe(300);
  });
});

describe('growing while open', () => {
  test('a window that still fits stays where the user put it', () => {
    const fit = expectInside(request({ center: false, bounds: { x: 100, y: 50, width: 556, height: 994 }, contentHeight: 1000 }));
    expect([fit.x, fit.y]).toEqual([100, 50]);
  });

  test('a window pushed past the bottom moves up just enough', () => {
    const fit = expectInside(request({ center: false, bounds: { x: 100, y: 600, width: 556, height: 994 }, contentHeight: 1132 }));
    expect(fit.x).toBe(100);
    expect(fit.y + 1132 + 39).toBe(1400);
  });

  test('a window dragged partly off the side is pulled back on', () => {
    const fit = expectInside(request({ center: false, bounds: { x: 2300, y: -40, width: 556, height: 994 } }));
    expect([fit.x, fit.y]).toEqual([2560 - 556, 0]);
  });
});
