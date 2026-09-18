import { describe, expect, it } from 'vitest';
import { NODE_INSPECT_DRAG_THRESHOLD_PX, isClickWithoutDrag } from '../../src/click-without-drag';

describe('click without drag', () => {
  it('treats a stationary pointer as a click', () => {
    expect(isClickWithoutDrag({ x: 40, y: 80 }, { x: 40, y: 80 })).toBe(true);
  });

  it('treats movement inside the threshold as a click', () => {
    expect(isClickWithoutDrag({ x: 10, y: 10 }, { x: 14, y: 12 })).toBe(true);
  });

  it('treats movement past the threshold as a drag', () => {
    expect(isClickWithoutDrag({ x: 10, y: 10 }, { x: 10 + NODE_INSPECT_DRAG_THRESHOLD_PX + 1, y: 10 })).toBe(false);
  });

  it('allows keyboard or synthetic clicks that have no pointer origin', () => {
    expect(isClickWithoutDrag(null, { x: 0, y: 0 })).toBe(true);
  });
});
