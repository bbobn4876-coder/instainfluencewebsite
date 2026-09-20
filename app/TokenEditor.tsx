"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { tokenPattern } from "@/lib/tokens";

const WAVE_MS = 520;
const WAVE_STEP_MS = 70;

type Props = {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  singleLine?: boolean;
  placeholder?: string;
};

type Part = { text: string; start: number; token: boolean };

function split(value: string): Part[] {
  const parts: Part[] = [];
  let last = 0;
  for (const match of value.matchAll(tokenPattern())) {
    const index = match.index ?? 0;
    if (index > last) parts.push({ text: value.slice(last, index), start: last, token: false });
    parts.push({ text: match[0], start: index, token: true });
    last = index + match[0].length;
  }
  parts.push({ text: value.slice(last), start: last, token: false });
  return parts;
}

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
  // The word the caret just completed, identified by where it sits in the text
  // rather than by its order, so typing a word before an existing one animates
  // the word that was actually typed.
  const [wave, setWave] = useState<{ start: number; text: string } | null>(null);
  const waveTimer = useRef<ReturnType<typeof setTimeout>>();

  const syncScroll = () => {
    if (mirrorRef.current && inputRef.current) {
      mirrorRef.current.scrollTop = inputRef.current.scrollTop;
      mirrorRef.current.scrollLeft = inputRef.current.scrollLeft;
    }
  };

  useEffect(syncScroll, [value]);
  useEffect(() => () => clearTimeout(waveTimer.current), []);

  const handleChange = (next: string, caret: number) => {
    const before = new Map(
      split(value)
        .filter((part) => part.token)
        .map((part) => [part.start, part.text] as const),
    );
    // A word is "just typed" when it ends at the caret and was not a token here
    // a moment ago — which also covers finishing a word by adding its last letter.
    const finished = split(next).find(
      (part) =>
        part.token &&
        part.start + part.text.length === caret &&
        before.get(part.start) !== part.text,
    );

    onChange(next);

    if (finished) {
      clearTimeout(waveTimer.current);
      setWave({ start: finished.start, text: finished.text });
      waveTimer.current = setTimeout(
        () => setWave(null),
        WAVE_MS + WAVE_STEP_MS * finished.text.length,
      );
    }
  };

  const parts = split(value);
  const shared: CSSProperties = singleLine ? {} : { minHeight: `${rows * 1.6}em` };

  return (
    <div className={`token-editor${singleLine ? " token-editor-single" : ""}`} style={shared}>
      <div className="token-mirror" ref={mirrorRef} aria-hidden>
        {parts.map((part) => {
          if (!part.token) return <span key={part.start}>{part.text}</span>;
          const waving = wave?.start === part.start && wave.text === part.text;
          return (
            <mark className="token" data-wave={waving} key={part.start}>
              {waving
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
          );
        })}
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
          onChange={(e) => handleChange(e.target.value, e.target.selectionStart ?? 0)}
        />
      ) : (
        <textarea
          ref={inputRef as React.RefObject<HTMLTextAreaElement>}
          className="token-input"
          rows={rows}
          value={value}
          placeholder={placeholder}
          onScroll={syncScroll}
          onChange={(e) => handleChange(e.target.value, e.target.selectionStart ?? 0)}
        />
      )}
    </div>
  );
}
