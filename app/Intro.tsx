"use client";

import { useEffect, useState } from "react";

const FADE_IN = 900;
const HOLD = 700;
const FADE_OUT = 900;

/**
 * Logo splash on the first load of a session: it fades in, holds, then
 * dissolves into the burgundy blur behind the app.
 */
export default function Intro() {
  const [phase, setPhase] = useState<"hidden" | "in" | "out" | "done">("hidden");

  useEffect(() => {
    let seen = false;
    try {
      seen = window.sessionStorage.getItem("intro-seen") === "1";
    } catch {
      /* storage can be blocked; show the intro then */
    }
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (seen || reduced) {
      setPhase("done");
      return;
    }

    try {
      window.sessionStorage.setItem("intro-seen", "1");
    } catch {
      /* ignore */
    }

    setPhase("in");
    const toOut = window.setTimeout(() => setPhase("out"), FADE_IN + HOLD);
    const toDone = window.setTimeout(() => setPhase("done"), FADE_IN + HOLD + FADE_OUT);
    return () => {
      window.clearTimeout(toOut);
      window.clearTimeout(toDone);
    };
  }, []);

  if (phase === "done") return null;

  return (
    <div className="intro" data-phase={phase} aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="intro-mark" src="/iconinfluence.png" alt="" />
    </div>
  );
}
