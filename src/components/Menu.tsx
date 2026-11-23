import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

export type MenuItem =
  | { kind?: 'item'; label: string; hint?: string; icon?: ReactNode; disabled?: boolean; onSelect(): void }
  | { kind: 'toggle'; label: string; hint?: string; checked: boolean; onToggle(next: boolean): void }
  | { kind: 'separator' };

interface Props {
  /** Accessible name of the trigger button. */
  label: string;
  trigger: ReactNode;
  items: MenuItem[];
  triggerClassName?: string;
  /** Which way the menu opens from the trigger. */
  placement?: 'top-end' | 'bottom-end';
}

/**
 * Popover menu following the WAI-ARIA menu-button pattern: Enter/Space/↓ open
 * it, ↑/↓/Home/End move, Esc or Tab close it and focus returns to the trigger.
 */
export function Menu({ label, trigger, items, triggerClassName = '', placement = 'top-end' }: Props) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const id = useId();

  const focusables = () => Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]:not([aria-disabled="true"])') ?? []);
  const focusAt = (i: number) => {
    const els = focusables();
    if (els.length) els[(i + els.length) % els.length].focus();
  };

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => focusAt(0));
    const onDown = (e: PointerEvent) => {
      if (menuRef.current?.contains(e.target as Node) || btnRef.current?.contains(e.target as Node)) return;
      setOpen(false);
      // The gesture that dismisses the menu shouldn't also act on what's under it (e.g. select a ring).
      const swallow = (ev: Event) => {
        ev.stopPropagation();
        ev.preventDefault();
      };
      window.addEventListener('pointerup', swallow, { capture: true, once: true });
      window.addEventListener('click', swallow, { capture: true, once: true });
      // If no click follows (e.g. a drag), stop swallowing.
      window.setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 600);
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [open]);

  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) btnRef.current?.focus();
  };

  const onMenuKey = (e: React.KeyboardEvent) => {
    const els = focusables();
    const i = els.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'ArrowDown') focusAt(i + 1);
    else if (e.key === 'ArrowUp') focusAt(i - 1);
    else if (e.key === 'Home') focusAt(0);
    else if (e.key === 'End') focusAt(els.length - 1);
    else if (e.key === 'Escape') close();
    else if (e.key === 'Tab') return close(false);
    else return;
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={label}
        title={label}
        className={triggerClassName}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        {trigger}
      </button>
      {open && (
        <div
          ref={menuRef}
          id={id}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKey}
          className={`menu-in glass absolute right-0 z-50 min-w-60 rounded-xl p-1.5 shadow-2xl shadow-black/50 ${placement === 'top-end' ? 'bottom-full mb-2' : 'top-full mt-2'}`}
        >
          {items.map((item, i) => {
            if (item.kind === 'separator') return <div key={i} role="separator" className="my-1 h-px bg-white/10" />;
            if (item.kind === 'toggle') {
              return (
                <button
                  key={i}
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={item.checked}
                  tabIndex={-1}
                  onClick={() => item.onToggle(!item.checked)}
                  className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm text-white/85 outline-none hover:bg-white/8 focus-visible:bg-white/10"
                >
                  <span className={`grid h-4 w-7 shrink-0 items-center rounded-full p-0.5 transition ${item.checked ? 'bg-white' : 'bg-white/20'}`} aria-hidden>
                    <span className={`h-3 w-3 rounded-full transition ${item.checked ? 'translate-x-3 bg-black' : 'bg-white/80'}`} />
                  </span>
                  <span className="flex-1">{item.label}</span>
                  {item.hint && <kbd className="kbd">{item.hint}</kbd>}
                </button>
              );
            }
            return (
              <button
                key={i}
                type="button"
                role="menuitem"
                tabIndex={-1}
                aria-disabled={item.disabled || undefined}
                onClick={() => {
                  if (item.disabled) return;
                  close();
                  item.onSelect();
                }}
                className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm text-white/85 outline-none hover:bg-white/8 focus-visible:bg-white/10 aria-disabled:cursor-not-allowed aria-disabled:opacity-40"
              >
                <span className="grid w-4 shrink-0 place-items-center text-white/60">{item.icon}</span>
                <span className="flex-1">{item.label}</span>
                {item.hint && <kbd className="kbd">{item.hint}</kbd>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
