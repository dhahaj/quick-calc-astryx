/** Where a window goes so that all of it is on screen. Pure geometry; no Electron. */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FitRequest {
  /** The screen's work area (without the taskbar). */
  area: Rect;
  /** The window's current outer bounds. */
  bounds: Rect;
  /** Outer size minus content size: title bar and borders. */
  frame: { width: number; height: number };
  contentWidth: number;
  /** The height the content would like; capped to what the screen allows. */
  contentHeight: number;
  /** Gap to keep from the screen edges when the content is capped. */
  margin: number;
  /** Centre in the work area (opening) instead of staying where it is. */
  center: boolean;
}

export interface Fit {
  contentHeight: number;
  x: number;
  y: number;
}

/**
 * Cap the content height to the screen, then centre (when opening) and clamp the window so
 * no part of it is outside the work area. A window that already fits doesn't move.
 */
export function fitOnScreen(req: FitRequest): Fit {
  const { area, bounds, frame, margin } = req;
  const contentHeight = Math.round(Math.max(1, Math.min(req.contentHeight, area.height - frame.height - 2 * margin)));
  const width = req.contentWidth + frame.width;
  const height = contentHeight + frame.height;
  let { x, y } = bounds;
  if (req.center) {
    x = area.x + Math.round((area.width - width) / 2);
    y = area.y + Math.round((area.height - height) / 2);
  }
  x = Math.max(area.x, Math.min(x, area.x + area.width - width));
  y = Math.max(area.y, Math.min(y, area.y + area.height - height));
  return { contentHeight, x, y };
}
