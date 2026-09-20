"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type SelectOption = { value: string; label: string; hint?: string };

type Props = {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  searchPlaceholder: string;
  emptyLabel: string;
  /** Opens upward when the trigger sits in the bottom dock. */
  drop?: "up" | "down";
};

export default function Select({
  value,
  options,
  onChange,
  searchPlaceholder,
  emptyLabel,
  drop = "up",
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const current = options.find((o) => o.value === value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q),
    );
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(Math.max(0, options.findIndex((o) => o.value === value)));
      searchRef.current?.focus();
    }
  }, [open, options, value]);

  const commit = (option: SelectOption) => {
    onChange(option.value);
    setOpen(false);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setActive((prev) => {
        const next = event.key === "ArrowDown" ? prev + 1 : prev - 1;
        if (filtered.length === 0) return 0;
        return (next + filtered.length) % filtered.length;
      });
      return;
    }
    if (event.key === "Enter" && filtered[active]) {
      event.preventDefault();
      commit(filtered[active]);
    }
  };

  return (
    <div className="select" ref={root} data-open={open} data-drop={drop}>
      <button
        type="button"
        className="select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        onKeyDown={(e) => {
          if (!open && (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span className="select-value">{current?.label ?? emptyLabel}</span>
        <svg className="select-caret" viewBox="0 0 20 20" aria-hidden>
          <path d="M6 8l4 4 4-4" />
        </svg>
      </button>

      {open ? (
        <div className="select-menu" role="listbox">
          <input
            ref={searchRef}
            className="select-search"
            value={query}
            placeholder={searchPlaceholder}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
          />
          <div className="select-list">
            {filtered.length === 0 ? (
              <div className="select-empty">{emptyLabel}</div>
            ) : (
              filtered.map((option, index) => (
                <button
                  type="button"
                  key={option.value}
                  role="option"
                  aria-selected={option.value === value}
                  className="select-option"
                  data-active={index === active}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => commit(option)}
                >
                  <span>{option.label}</span>
                  {option.hint ? <span className="select-hint">{option.hint}</span> : null}
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
