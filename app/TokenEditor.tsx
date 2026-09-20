"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import { tokenPattern } from "@/lib/tokens";

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

  const syncScroll = () => {
    if (mirrorRef.current && inputRef.current) {
      mirrorRef.current.scrollTop = inputRef.current.scrollTop;
      mirrorRef.current.scrollLeft = inputRef.current.scrollLeft;
    }
  };

  useEffect(syncScroll, [value]);


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

  const shared: CSSProperties = singleLine ? {} : { minHeight: `${rows * 1.6}em` };

  return (
    <div className={`token-editor${singleLine ? " token-editor-single" : ""}`} style={shared}>
      <div className="token-mirror" ref={mirrorRef} aria-hidden>
        {parts.map((part) =>
          part.token ? (
            <mark className="token" key={part.key}>
              {part.text}
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
