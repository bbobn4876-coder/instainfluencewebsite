"use client";

import { useEffect, useState } from "react";

const FADE_IN = 420;
const HOLD = 260;
const FADE_OUT = 420;

export const WELCOME_MS = FADE_IN + HOLD + FADE_OUT;

/**
 * Covers the moment between signing in and the app appearing: the mark blooms
 * over the page the visitor came from, then dissolves onto the account. The
 * same gesture as the app's own splash, kept short because it sits between a
 * click and the thing that was clicked for.
 */
export default function Welcome({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<"in" | "out">("in");

  useEffect(() => {
    const toOut = window.setTimeout(() => setPhase("out"), FADE_IN + HOLD);
    const toDone = window.setTimeout(onDone, WELCOME_MS);
    return () => {
      window.clearTimeout(toOut);
      window.clearTimeout(toDone);
    };
  }, [onDone]);

  return (
    <div className="welcome" data-phase={phase} aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="welcome-mark" src="/iconinfluence.png" alt="" />
    </div>
  );
}
