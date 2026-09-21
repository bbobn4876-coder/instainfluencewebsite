"use client";

import { useEffect, useRef, useState } from "react";
import PlanCards from "./PlanCards";
import { dict, type Language } from "@/lib/i18n";

/**
 * The public page: its own header, sections and footer, with none of the app
 * shell around it. Only ever shown to signed-out visitors.
 */
export default function Landing({
  language,
  onLanguage,
  onSignIn,
  onSignUp,
}: {
  language: Language;
  onLanguage: (language: Language) => void;
  onSignIn: () => void;
  onSignUp: () => void;
}) {
  const t = dict(language).home;
  const [scrolled, setScrolled] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [legal, setLegal] = useState<"terms" | "privacy" | "cookie" | null>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="landing">
      <header className="landing-header" data-scrolled={scrolled}>
        <a className="landing-brand" href="#top">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/iconinfluence.png" alt="" />
          <span>Loomera</span>
        </a>

        <nav className="landing-nav">
          <a href="#features">{t.navFeatures}</a>
          <a href="#how">{t.navHow}</a>
          <a href="#pricing">{t.navPricing}</a>
          <a href="#faq">{t.navFaq}</a>
        </nav>

        <div className="landing-actions">
          <button
            className="landing-lang"
            onClick={() => onLanguage(language === "ru" ? "en" : "ru")}
            aria-label="Language"
          >
            {language === "ru" ? "EN" : "RU"}
          </button>
          <button className="btn btn-ghost" onClick={onSignIn}>
            {t.ctaSignIn}
          </button>
          <button className="btn" onClick={onSignUp}>
            {t.cta}
          </button>
        </div>
      </header>

      <main className="landing-main" id="top">
        <section className="landing-hero">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="home-mark" src="/iconinfluence.png" alt="" />
          <h1 className="home-title">{t.title}</h1>
          <p className="home-tagline">{t.tagline}</p>
          <div className="locked-actions">
            <button className="btn" onClick={onSignUp}>
              {t.cta}
            </button>
            <button className="btn btn-ghost" onClick={onSignIn}>
              {t.ctaSignIn}
            </button>
          </div>
        </section>

        <section className="landing-section" id="features">
          <h2 className="home-section">{t.featuresTitle}</h2>
          <div className="home-features">
            {t.features.map((feature) => (
              <article className="home-feature" key={feature.title}>
                <h3 className="home-feature-title">{feature.title}</h3>
                <p className="home-feature-body">{feature.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="landing-section" id="how">
          <h2 className="home-section">{t.howTitle}</h2>
          <ol className="landing-steps">
            {t.steps.map((step, index) => (
              <li className="landing-step" key={step.title}>
                <span className="landing-step-number">{index + 1}</span>
                <div>
                  <h3 className="home-feature-title">{step.title}</h3>
                  <p className="home-feature-body">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="landing-section" id="pricing">
          <h2 className="home-section">{t.pricingTitle}</h2>
          <p className="home-feature-body landing-pricing-sub">{t.pricingSub}</p>
          {/* Choosing a plan while signed out starts the sign-up. */}
          <PlanCards copy={t} onChoose={onSignUp} />
        </section>

        <section className="landing-section" id="faq">
          <h2 className="home-section">{t.faqTitle}</h2>
          <div className="landing-faq">
            {t.faq.map((item, index) => (
              <FaqItem
                key={item.q}
                question={item.q}
                answer={item.a}
                open={openFaq === index}
                onToggle={() => setOpenFaq(openFaq === index ? null : index)}
              />
            ))}
          </div>
        </section>

        <section className="landing-cta">
          <h2 className="home-feature-title">{t.tagline}</h2>
          <button className="btn" onClick={onSignUp}>
            {t.cta}
          </button>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="landing-footer-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/iconinfluence.png" alt="" />
          <div>
            <strong>Loomera</strong>
            <span>{t.footerNote}</span>
          </div>
        </div>
        <nav className="landing-footer-links">
          <button onClick={() => setLegal("terms")}>{t.legal.terms}</button>
          <button onClick={() => setLegal("privacy")}>{t.legal.privacy}</button>
          <button onClick={() => setLegal("cookie")}>{t.legal.cookie}</button>
        </nav>
      </footer>

      {legal ? (
        <LegalModal
          title={t.legal[legal]}
          updated={t.legal.updated}
          closeLabel={t.legal.close}
          sections={
            legal === "terms"
              ? t.legal.termsBody
              : legal === "privacy"
                ? t.legal.privacyBody
                : t.legal.cookieBody
          }
          onClose={() => setLegal(null)}
        />
      ) : null}
    </div>
  );
}


/** Whole card toggles; the answer animates on its measured height. */
function FaqItem({
  question,
  answer,
  open,
  onToggle,
}: {
  question: string;
  answer: string;
  open: boolean;
  onToggle: () => void;
}) {
  const body = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const measure = () => setHeight(body.current?.scrollHeight ?? 0);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [answer]);

  return (
    <button
      type="button"
      className="landing-faq-item"
      aria-expanded={open}
      data-open={open}
      onClick={onToggle}
    >
      <span className="landing-faq-question">
        {question}
        <span className="landing-faq-sign" aria-hidden>
          <svg viewBox="0 0 20 20">
            <path d="M4 10h12M10 4v12" />
          </svg>
        </span>
      </span>
      <div className="landing-faq-answer" style={{ height: open ? height : 0 }}>
        <div ref={body}>
          <p className="home-feature-body">{answer}</p>
        </div>
      </div>
    </button>
  );
}

function LegalModal({
  title,
  updated,
  closeLabel,
  sections,
  onClose,
}: {
  title: string;
  updated: string;
  closeLabel: string;
  sections: readonly { readonly title: string; readonly body: string }[];
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
          <span className="legal-updated">{updated}</span>
        </header>

        {sections.map((section) => (
          <section className="legal-section" key={section.title}>
            <h3 className="legal-section-title">{section.title}</h3>
            <p className="legal-section-body">{section.body}</p>
          </section>
        ))}
      </div>
    </div>
  );
}
