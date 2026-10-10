import { useLayoutEffect, useRef, useState, type KeyboardEvent, type Ref, type RefObject } from 'react';
import { RichText } from './RichText';
import { useLinkInput } from './LinkInput';

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
  /** Links: URLs are clickable when the field is not being edited, and Ctrl/⌘ + K turns a selection into a link */
  rich?: boolean;
}

/** Multi-line text field that grows with its content. */
export function AutoText({ value, onChange, className, placeholder, onEnter, onKeyDown, onBlur, autoFocus, inputRef, ariaLabel, rich }: Props) {
  const own = useRef<HTMLTextAreaElement>(null);
  const ref = inputRef ?? own;
  const [editing, setEditing] = useState(false);
  const links = useLinkInput(ref, value, onChange);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }, [value, ref, editing]);

  if (rich && !editing && value) {
    // Read mode: clicking a link opens it, anywhere else starts editing
    return (
      <div
        className={(className ?? '') + ' rich'}
        role="textbox"
        aria-readonly="true"
        aria-label={ariaLabel}
        tabIndex={0}
        onFocus={(e) => e.target === e.currentTarget && setEditing(true)}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('a')) return;
          setEditing(true);
        }}>
        <RichText text={value} />
      </div>
    );
  }

  return (
    <>
      <textarea
        ref={ref as Ref<HTMLTextAreaElement>}
        rows={1}
        className={className}
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus || (rich && editing)}
        aria-label={ariaLabel}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => {
          if (rich && !links.active) setEditing(false);
          onBlur?.();
        }}
        onKeyDown={(e) => {
          if (rich && links.onKeyDown(e)) return;
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
      {rich && links.bar}
    </>
  );
}
