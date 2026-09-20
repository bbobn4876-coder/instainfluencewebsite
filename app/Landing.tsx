"use client";

import { useEffect, useState } from "react";
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

        <section className="landing-section" id="faq">
          <h2 className="home-section">{t.faqTitle}</h2>
          <div className="landing-faq">
            {t.faq.map((item) => (
              <details className="landing-faq-item" key={item.q}>
                <summary>{item.q}</summary>
                <p className="home-feature-body">{item.a}</p>
              </details>
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
        <p className="landing-footer-legal">{t.footerLegal}</p>
        <nav className="landing-footer-links">
          <a href="#features">{t.navFeatures}</a>
          <a href="#how">{t.navHow}</a>
          <a href="#faq">{t.navFaq}</a>
        </nav>
      </footer>
    </div>
  );
}
