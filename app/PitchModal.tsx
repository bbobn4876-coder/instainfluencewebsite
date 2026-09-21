"use client";

import { useCallback, useEffect, useState } from "react";
import PitchArt from "./PitchArt";

type Slide = { title: string; body: string };

/** Matches the exit transition in the stylesheet. */
const LEAVE_MS = 260;

/**
 * What the product does, for a visitor who asked about the subscription before
 * they have an account. Four steps — what it is, what hurts, what it looks like
 * in use, and the way in — laid out like the sign-in dialog it hands over to,
 * so the change of panel reads as one window rather than two.
 */
export default function PitchModal({
  slides,
  art,
  title,
  next,
  start,
  close,
  onStart,
  onClose,
}: {
  slides: readonly Slide[];
  art: React.ComponentProps<typeof PitchArt>["copy"];
  title: string;
  next: string;
  start: string;
  close: string;
  onStart: () => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const last = step === slides.length - 1;

  /** Plays the exit before the sign-in dialog takes its place. */
  const handover = useCallback(() => {
    setLeaving(true);
    window.setTimeout(onStart, LEAVE_MS);
  }, [onStart]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowRight") setStep((s) => Math.min(slides.length - 1, s + 1));
      if (event.key === "ArrowLeft") setStep((s) => Math.max(0, s - 1));
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose, slides.length]);

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="pitch" data-leaving={leaving} role="dialog" aria-modal aria-label={title}>
        <aside className="pitch-aside">
          <div className="subscribe-glow" aria-hidden />
          <div className="subscribe-noise pitch-noise" aria-hidden />
          <div className="pitch-art" key={step}>
            <PitchArt step={step} copy={art} />
          </div>
        </aside>

        <div className="pitch-panel">
          <button type="button" className="modal-close" onClick={onClose} aria-label={close}>
            <svg viewBox="0 0 20 20" aria-hidden>
              <path d="M5 5l10 10M15 5L5 15" />
            </svg>
          </button>

          <div className="pitch-brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/iconinfluence.png" alt="" />
            <span>Loomera</span>
          </div>

          <div className="pitch-slide" key={step}>
            <h2 className="pitch-title">{slides[step]?.title}</h2>
            <p className="pitch-body">{slides[step]?.body}</p>
          </div>

          <div className="pitch-foot">
            <div className="pitch-dots">
              {slides.map((slide, index) => (
                <button
                  type="button"
                  key={slide.title}
                  className="auth-dot"
                  data-active={index === step}
                  aria-label={slide.title}
                  onClick={() => setStep(index)}
                />
              ))}
            </div>

            <button
              className="btn pitch-action"
              onClick={() => (last ? handover() : setStep((s) => s + 1))}
            >
              {last ? start : next}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
