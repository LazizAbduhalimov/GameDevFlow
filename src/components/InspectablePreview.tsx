import type { HTMLAttributes, KeyboardEvent, ReactNode } from 'react';
import { useClickWithoutDrag } from '../click-without-drag';

type InspectablePreviewProps = {
  className?: string;
  title?: string;
  ariaLabel?: string;
  disabled?: boolean;
  onInspect?: () => void;
  children?: ReactNode;
} & Omit<HTMLAttributes<HTMLDivElement>, 'onClick' | 'onPointerDown' | 'title'>;

export function InspectablePreview({
  className,
  title,
  ariaLabel,
  disabled,
  onInspect,
  children,
  onKeyDown,
  ...rest
}: InspectablePreviewProps) {
  const inspect = useClickWithoutDrag(disabled ? undefined : onInspect);
  const interactive = Boolean(onInspect) && !disabled;

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    onKeyDown?.(event);
    if (event.defaultPrevented || !interactive) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onInspect?.();
    }
  }

  return (
    <div
      {...rest}
      className={className}
      title={title}
      aria-label={ariaLabel}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={handleKeyDown}
      {...inspect}
    >
      {children}
    </div>
  );
}
