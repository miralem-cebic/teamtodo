import { useLayoutEffect, useRef, type KeyboardEvent, type Ref, type RefObject } from 'react';

interface Props {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  placeholder?: string;
  onEnter?: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  onKeyDown?: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  onBlur?: () => void;
  autoFocus?: boolean;
  inputRef?: RefObject<HTMLTextAreaElement>;
  ariaLabel: string;
}

/** Mehrzeiliges Textfeld, das mit dem Inhalt wächst. */
export function AutoText({ value, onChange, className, placeholder, onEnter, onKeyDown, onBlur, autoFocus, inputRef, ariaLabel }: Props) {
  const own = useRef<HTMLTextAreaElement>(null);
  const ref = inputRef ?? own;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }, [value, ref]);
  return (
    <textarea
      ref={ref as Ref<HTMLTextAreaElement>}
      rows={1}
      className={className}
      value={value}
      placeholder={placeholder}
      autoFocus={autoFocus}
      aria-label={ariaLabel}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      onKeyDown={(e) => {
        onKeyDown?.(e);
        if (e.defaultPrevented) return;
        if (onEnter && e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
          e.preventDefault();
          onEnter(e);
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
    />
  );
}
