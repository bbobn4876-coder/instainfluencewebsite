"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { tokenPattern } from "@/lib/tokens";

const WAVE_MS = 340;
const WAVE_STEP_MS = 38;

type Props = {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  singleLine?: boolean;
  placeholder?: string;
};

/**
 * A textarea with the substituted words highlighted. The text is mirrored into
 * a div behind a transparent input, so the caret and selection stay native.
 */
export default function TokenEditor({
  value,
  onChange,
  rows = 12,
  singleLine = false,
  placeholder,
}: Props) {
  const inputRef = useRef<HTMLTextAreaElement | HTMLInputElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
  // Letters are split into boxes only while the wave runs; once it finishes the
  // word goes back to plain text so the mirror matches the input exactly.
  const [waving, setWaving] = useState<string[]>([]);
  const known = useRef(new Set<string>());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const syncScroll = () => {
    if (mirrorRef.current && inputRef.current) {
      mirrorRef.current.scrollTop = inputRef.current.scrollTop;
      mirrorRef.current.scrollLeft = inputRef.current.scrollLeft;
    }
  };

  useEffect(syncScroll, [value]);

  useEffect(
    () => () => {
      timers.current.forEach((timer) => clearTimeout(timer));
    },
    [],
  );


  // Keys stay stable per token occurrence, so a mark is not re-mounted (and its
  // entry animation not replayed) when text around it changes.
  const parts: Array<{ text: string; key: string; token: boolean }> = [];
  const seen = new Map<string, number>();
  let last = 0;
  for (const match of value.matchAll(tokenPattern())) {
    const index = match.index ?? 0;
    if (index > last) {
      parts.push({ text: value.slice(last, index), key: `t${last}`, token: false });
    }
    const ordinal = (seen.get(match[0]) ?? 0) + 1;
    seen.set(match[0], ordinal);
    parts.push({ text: match[0], key: `${match[0]}#${ordinal}`, token: true });
    last = index + match[0].length;
  }
  parts.push({ text: value.slice(last), key: "tail", token: false });

  // Start the wave for words that have just become tokens, and forget the ones
  // that were edited away so retyping them animates again.
  const present = new Set(parts.filter((part) => part.token).map((part) => part.key));
  for (const key of present) {
    if (known.current.has(key)) continue;
    known.current.add(key);
    setWaving((prev) => (prev.includes(key) ? prev : [...prev, key]));
    const timer = setTimeout(() => {
      setWaving((prev) => prev.filter((k) => k !== key));
      timers.current.delete(key);
    }, WAVE_MS + WAVE_STEP_MS * 12);
    timers.current.set(key, timer);
  }
  for (const key of known.current) {
    if (!present.has(key)) known.current.delete(key);
  }

  const shared: CSSProperties = singleLine ? {} : { minHeight: `${rows * 1.6}em` };

  return (
    <div className={`token-editor${singleLine ? " token-editor-single" : ""}`} style={shared}>
      <div className="token-mirror" ref={mirrorRef} aria-hidden>
        {parts.map((part) =>
          part.token ? (
            <mark className="token" key={part.key}>
              {waving.includes(part.key)
                ? [...part.text].map((letter, i) => (
                    <span
                      className="token-letter"
                      key={i}
                      style={{ animationDelay: `${i * WAVE_STEP_MS}ms` }}
                    >
                      {letter}
                    </span>
                  ))
                : part.text}
            </mark>
          ) : (
            <span key={part.key}>{part.text}</span>
          ),
        )}
        {/* Keeps the last line visible while scrolling. */}
        {singleLine ? null : "\n"}
      </div>

      {singleLine ? (
        <input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          className="token-input"
          value={value}
          placeholder={placeholder}
          onScroll={syncScroll}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <textarea
          ref={inputRef as React.RefObject<HTMLTextAreaElement>}
          className="token-input"
          rows={rows}
          value={value}
          placeholder={placeholder}
          onScroll={syncScroll}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}
