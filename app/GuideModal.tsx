"use client";

import { useEffect } from "react";

type Step = {
  readonly title: string;
  readonly items: readonly string[];
  readonly links: readonly { readonly label: string; readonly url: string }[];
};

export default function GuideModal({
  title,
  intro,
  steps,
  note,
  closeLabel,
  onClose,
}: {
  title: string;
  intro: string;
  steps: readonly Step[];
  note: string;
  closeLabel: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal legal-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <button className="modal-close" onClick={onClose} aria-label={closeLabel}>
          <svg viewBox="0 0 20 20" aria-hidden>
            <path d="M5 5l10 10M15 5L5 15" />
          </svg>
        </button>

        <header className="legal-head">
          <h2 className="modal-title">{title}</h2>
          <span className="legal-updated">{intro}</span>
        </header>

        {steps.map((step) => (
          <section className="legal-section" key={step.title}>
            <h3 className="legal-section-title">{step.title}</h3>
            <ol className="guide-list">
              {step.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ol>
            {step.links.length > 0 ? (
              <div className="chips">
                {step.links.map((link) => (
                  <a
                    className="chip chip-mail"
                    key={link.url}
                    href={link.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {link.label} ↗
                  </a>
                ))}
              </div>
            ) : null}
          </section>
        ))}

        <p className="legal-section-body">{note}</p>
      </div>
    </div>
  );
}
