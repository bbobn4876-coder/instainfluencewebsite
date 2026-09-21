"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * Read once per page load, not once per effect: React runs effects twice in
 * development, and a second pass would find the flag already consumed and
 * play the splash anyway.
 */
let cameFromSubscribe: boolean | undefined;

function arrivedFromSubscribe(): boolean {
  if (cameFromSubscribe === undefined) {
    try {
      cameFromSubscribe = window.sessionStorage.getItem("from-subscribe") === "1";
      if (cameFromSubscribe) window.sessionStorage.removeItem("from-subscribe");
    } catch {
      cameFromSubscribe = false;
    }
  }
  return cameFromSubscribe;
}

const FADE_IN = 900;
const HOLD = 700;
const FADE_OUT = 900;

/**
 * Logo splash when the app opens: it fades in, holds, then dissolves into the
 * burgundy blur behind it. Visitors who are not signed in go straight to the
 * landing page instead — the splash is the app's own door, not the site's.
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
    let signedIn = false;
    try {
      motionOff = window.localStorage.getItem("motion") === "off";
      // Written when auth resolves, so the choice is made before paint rather
      // than after a round trip that would let the splash arrive late.
      signedIn = window.localStorage.getItem("signed-in") === "1";
    } catch {
      /* storage can be blocked; the landing simply never splashes */
    }
    // Returning from the configurator is a navigation inside the product, not
    // an entrance to it, so the splash stays out of the way.
    if (!signedIn || arrivedFromSubscribe()) {
      setPhase("done");
      return;
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

  if (phase === "hidden" || phase === "done") return null;

  return (
    <div className="intro" data-phase={phase} aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="intro-mark" src="/iconinfluence.png" alt="" />
    </div>
  );
}
