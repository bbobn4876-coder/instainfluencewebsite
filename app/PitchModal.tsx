"use client";

import { useEffect, useState } from "react";

type Slide = { kicker: string; title: string; body: string };

/**
 * What the product does, for a visitor who asked about the subscription before
 * they have an account. Four steps — what it is, what hurts, what it looks like
 * in use, and the way in — in the configurator's own clothes.
 */
export default function PitchModal({
  slides,
  title,
  next,
  start,
  close,
  onStart,
  onClose,
}: {
  slides: readonly Slide[];
  title: string;
  next: string;
  start: string;
  close: string;
  onStart: () => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState(0);
  const last = step === slides.length - 1;

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
      <div className="pitch" role="dialog" aria-modal aria-label={title}>
        <div className="subscribe-glow" aria-hidden />
        <div className="subscribe-noise" aria-hidden />

        <button type="button" className="modal-close" onClick={onClose} aria-label={close}>
          <svg viewBox="0 0 20 20" aria-hidden>
            <path d="M5 5l10 10M15 5L5 15" />
          </svg>
        </button>

        <div className="pitch-inner">
          <div className="pitch-brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/iconinfluence.png" alt="" />
            <span>Loomera</span>
          </div>

          <div className="pitch-slide" key={step}>
            <span className="pitch-kicker">{slides[step]?.kicker}</span>
            <h2 className="pitch-title">{slides[step]?.title}</h2>
            <p className="pitch-body">{slides[step]?.body}</p>
          </div>

          <div className="pitch-foot">
            <div className="pitch-dots">
              {slides.map((slide, index) => (
                <button
                  type="button"
                  key={slide.kicker}
                  className="auth-dot"
                  data-active={index === step}
                  aria-label={slide.kicker}
                  onClick={() => setStep(index)}
                />
              ))}
            </div>

            <button
              className="btn pitch-action"
              onClick={() => (last ? onStart() : setStep((s) => s + 1))}
            >
              {last ? start : next}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
