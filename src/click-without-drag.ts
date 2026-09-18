import { useRef, type MouseEvent, type PointerEvent } from 'react';

export const NODE_INSPECT_DRAG_THRESHOLD_PX = 6;

export function isClickWithoutDrag(
  origin: { x: number; y: number } | null | undefined,
  point: { x: number; y: number },
  thresholdPx = NODE_INSPECT_DRAG_THRESHOLD_PX,
): boolean {
  if (!origin) return true;
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  return (dx * dx) + (dy * dy) <= thresholdPx * thresholdPx;
}

export function useClickWithoutDrag(
  onActivate?: () => void,
  thresholdPx = NODE_INSPECT_DRAG_THRESHOLD_PX,
) {
  const originRef = useRef<{ x: number; y: number } | null>(null);
  const activateRef = useRef(onActivate);
  activateRef.current = onActivate;

  return {
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      if (event.button !== 0) return;
      originRef.current = { x: event.clientX, y: event.clientY };
    },
    onClick: (event: MouseEvent<HTMLElement>) => {
      const origin = originRef.current;
      originRef.current = null;
      if (!activateRef.current) return;
      if (!isClickWithoutDrag(origin, { x: event.clientX, y: event.clientY }, thresholdPx)) {
        event.preventDefault();
        return;
      }
      activateRef.current();
    },
  };
}
