"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, type CSSProperties } from "react";
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
export type TokenEditorHandle = { insert: (text: string) => void };

const TokenEditor = forwardRef<TokenEditorHandle, Props>(function TokenEditor(
  { value, onChange, rows = 12, singleLine = false, placeholder },
  ref,
) {
  const inputRef = useRef<HTMLTextAreaElement | HTMLInputElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);

  const syncScroll = () => {
    if (mirrorRef.current && inputRef.current) {
      mirrorRef.current.scrollTop = inputRef.current.scrollTop;
      mirrorRef.current.scrollLeft = inputRef.current.scrollLeft;
    }
  };

  useEffect(syncScroll, [value]);

  useImperativeHandle(ref, () => ({
    insert(text: string) {
      const field = inputRef.current;
      if (!field) {
        onChange(value + text);
        return;
      }
      const start = field.selectionStart ?? value.length;
      const end = field.selectionEnd ?? start;
      // Keep the words readable: add a space when typing straight after a word.
      const prefix = value.slice(0, start);
      const spacer = prefix && !/\s$/.test(prefix) ? " " : "";
      const next = `${prefix}${spacer}${text}${value.slice(end)}`;
      onChange(next);
      const caret = start + spacer.length + text.length;
      requestAnimationFrame(() => {
        field.focus();
        field.setSelectionRange(caret, caret);
      });
    },
  }));

  const parts: Array<{ text: string; token: boolean }> = [];
  let last = 0;
  for (const match of value.matchAll(tokenPattern())) {
    const index = match.index ?? 0;
    if (index > last) parts.push({ text: value.slice(last, index), token: false });
    parts.push({ text: match[0], token: true });
    last = index + match[0].length;
  }
  parts.push({ text: value.slice(last), token: false });

  const shared: CSSProperties = singleLine ? {} : { minHeight: `${rows * 1.6}em` };

  return (
    <div className={`token-editor${singleLine ? " token-editor-single" : ""}`} style={shared}>
      <div className="token-mirror" ref={mirrorRef} aria-hidden>
        {parts.map((part, index) =>
          part.token ? (
            <mark className="token" key={index}>
              {part.text}
            </mark>
          ) : (
            <span key={index}>{part.text}</span>
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
});

export default TokenEditor;
