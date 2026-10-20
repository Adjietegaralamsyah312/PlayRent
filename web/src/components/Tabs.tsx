import { useId, useRef } from 'react';

export interface TabItem { value: string; label: string; count?: number; disabled?: boolean }

export interface TabsProps {
  items: TabItem[];
  value: string;
  onChange: (v: string) => void;
  variant?: 'underline' | 'pill';
  /**
   * Id prefix for the tab/tabpanel pair. A page that renders `TabPanel`s
   * passes its own prefix so `aria-controls` really points at the panel
   * (DS-010 M4); without it the generated ids are private to this component.
   *
   * The prefix is also the switch for `aria-controls`: a page without panels
   * gets no attribute at all, so a tab never promises a panel that does not
   * exist (DS-011 M-A — 28 dangling IDREFs on the operator screens).
   */
  idPrefix?: string;
}

export function Tabs({ items, value, onChange, variant = 'underline', idPrefix }: TabsProps) {
  const autoId = useId();
  const baseId = idPrefix ?? autoId;
  const listRef = useRef<HTMLDivElement>(null);

  function onKeyDown(e: React.KeyboardEvent) {
    const enabled = items.filter((i) => !i.disabled);
    if (enabled.length === 0) return;
    const idx = enabled.findIndex((i) => i.value === value);
    let next: TabItem | undefined;
    if (e.key === 'ArrowRight') next = enabled[(idx + 1) % enabled.length];
    else if (e.key === 'ArrowLeft') next = enabled[(idx - 1 + enabled.length) % enabled.length];
    else if (e.key === 'Home') next = enabled[0];
    else if (e.key === 'End') next = enabled[enabled.length - 1];
    if (!next) return;
    e.preventDefault();
    onChange(next.value);
    listRef.current?.querySelector<HTMLButtonElement>(`#${CSS.escape(`${baseId}-tab-${next.value}`)}`)?.focus();
  }

  return (
    <div
      ref={listRef}
      role="tablist"
      onKeyDown={onKeyDown}
      className={[
        'flex items-center gap-1 overflow-x-auto',
        variant === 'underline' ? 'border-b border-border' : 'rounded-[var(--radius-full)] bg-surface p-1',
      ].join(' ')}
    >
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            id={`${baseId}-tab-${item.value}`}
            role="tab"
            type="button"
            aria-selected={active}
            aria-controls={idPrefix ? `${baseId}-panel-${item.value}` : undefined}
            tabIndex={active ? 0 : -1}
            disabled={item.disabled}
            onClick={() => onChange(item.value)}
            className={[
              'inline-flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap px-3 py-2 text-body-sm font-medium transition-colors duration-fast',
              'disabled:cursor-not-allowed disabled:opacity-50',
              variant === 'underline'
                ? active
                  ? 'border-b-2 border-accent text-text'
                  : 'border-b-2 border-transparent text-text-secondary hover:text-text'
                : active
                  ? 'rounded-[var(--radius-full)] bg-accent text-white'
                  : 'rounded-[var(--radius-full)] text-text-secondary hover:text-text',
            ].join(' ')}
          >
            {item.label}
            {item.count !== undefined && (
              <span className={[
                'tnum rounded-[var(--radius-full)] px-1.5 text-caption',
                active && variant === 'pill' ? 'bg-white/20' : 'bg-surface-hover text-text-secondary',
              ].join(' ')}
              >
                {item.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({ id, value: _value, children, hidden }: { id: string; value: string; children: React.ReactNode; hidden?: boolean }) {
  return (
    <div role="tabpanel" id={id} aria-labelledby={id.replace('-panel-', '-tab-')} tabIndex={0} hidden={hidden} className="outline-none">
      {children}
    </div>
  );
}
