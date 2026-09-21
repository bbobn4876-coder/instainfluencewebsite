"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

const FADE_IN = 900;
const HOLD = 700;
const FADE_OUT = 900;

/**
 * Logo splash on every page load: it fades in, holds, then dissolves into
 * the burgundy blur behind the app.
 */
export default function Intro() {
  const [phase, setPhase] = useState<"hidden" | "in" | "out" | "done">("hidden");
  const pathname = usePathname();
  // The splash belongs to the app itself, not to pages opened from it.
  const skip = pathname !== "/";

  useEffect(() => {
    if (skip) {
      setPhase("done");
      return;
    }
    let motionOff = false;
    try {
      motionOff = window.localStorage.getItem("motion") === "off";
    } catch {
      /* storage can be blocked; the intro plays */
    }
    if (motionOff || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setPhase("done");
      return;
    }

    setPhase("in");
    const toOut = window.setTimeout(() => setPhase("out"), FADE_IN + HOLD);
    const toDone = window.setTimeout(() => setPhase("done"), FADE_IN + HOLD + FADE_OUT);
    return () => {
      window.clearTimeout(toOut);
      window.clearTimeout(toDone);
    };
  }, [skip]);

  if (phase === "done") return null;

  return (
    <div className="intro" data-phase={phase} aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="intro-mark" src="/iconinfluence.png" alt="" />
    </div>
  );
}
