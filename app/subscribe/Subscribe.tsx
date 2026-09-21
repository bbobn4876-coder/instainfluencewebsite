"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CURRENCY_OF,
  DEFAULT_CONFIG,
  DEPTHS,
  SENDER_INCLUDED,
  SENDER_MAX,
  SENDER_PRICE,
  VOLUMES,
  PRIORITY_SUPPORT_PRICE,
  VOLUME_ORDER,
  formatPrice,
  priceLines,
  priceOf,
  type DepthId,
  type SubscriptionConfig,
  type VolumeId,
} from "@/lib/plans";
import { dict, type Language } from "@/lib/i18n";

/** Matches the exit transition in the stylesheet. */
const LEAVE_MS = 260;

/**
 * The subscription configurator: options on the right, a running summary on
 * the left. Prices add up the way a hardware configurator works, so the total
 * is always visible while choices are made.
 */
export default function Subscribe() {
  const [language, setLanguage] = useState<Language>("en");
  const [config, setConfig] = useState<SubscriptionConfig>(DEFAULT_CONFIG);
  const [saved, setSaved] = useState<SubscriptionConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  // "in" once mounted, "out" while the page hands control back.
  const [transition, setTransition] = useState<"enter" | "in" | "out">("enter");
  const t = dict(language).plan;

  useEffect(() => {
    const frame = requestAnimationFrame(() => setTransition("in"));
    return () => cancelAnimationFrame(frame);
  }, []);

  /** Plays the exit before handing over, so the change of page is not a cut. */
  const leaveTo = useCallback((href: string) => {
    setTransition("out");
    window.setTimeout(() => {
      window.location.href = href;
    }, LEAVE_MS);
  }, []);

  useEffect(() => {
    // Tells the app not to splash when this page hands control back.
    try {
      window.sessionStorage.setItem("from-subscribe", "1");
    } catch {
      /* storage can be blocked; the splash then plays as usual */
    }

    // The account's language, so the page opens in the same one as the app.
    fetch("/api/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { language?: Language } | null) => {
        if (data?.language === "ru" || data?.language === "en") setLanguage(data.language);
      })
      .catch(() => undefined);

    fetch("/api/plan")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.config) {
          setConfig(data.config as SubscriptionConfig);
          setSaved(data.config as SubscriptionConfig);
        }
      })
      .catch(() => undefined)
      .finally(() => setReady(true));
  }, []);

  const switchLanguage = useCallback((next: Language) => {
    setLanguage(next);
    // Saved on the account, so going back to the app keeps the choice.
    void fetch("/api/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ language: next }),
    }).catch(() => undefined);
  }, []);

  const currency = CURRENCY_OF[language] ?? "usd";
  const lines = useMemo(() => priceLines(config, currency), [config, currency]);
  const total = useMemo(() => priceOf(config, currency), [config, currency]);
  const money = useCallback((amount: number) => formatPrice(amount, currency), [currency]);
  const changed = useMemo(() => JSON.stringify(saved) !== JSON.stringify(config), [saved, config]);

  const submit = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ config }),
      });
      if (res.ok) leaveTo("/");
    } finally {
      setBusy(false);
    }
  }, [config, leaveTo]);

  const cancel = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ config: null }),
      });
      if (res.ok) leaveTo("/");
    } finally {
      setBusy(false);
    }
  }, [leaveTo]);

  return (
    <div className="subscribe" data-transition={transition}>
      <aside className="subscribe-aside">
        <div className="subscribe-glow" aria-hidden />
        <div className="subscribe-noise" aria-hidden />

        <div className="subscribe-aside-inner">
          <a
            className="subscribe-brand"
            href="/"
            onClick={(event) => {
              event.preventDefault();
              leaveTo("/");
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/iconinfluence.png" alt="" />
            <span>Loomera</span>
          </a>

          <div className="subscribe-summary">
            <h2 className="subscribe-summary-title">{t.summaryTitle}</h2>
            <ul className="subscribe-lines">
              {lines.map((line) => (
                <li className="subscribe-line" key={line.key}>
                  <span>
                    {t.lineLabels[line.key as keyof typeof t.lineLabels] ?? line.key}
                    {line.key === "senders" ? ` · ${t.sendersValue(config.senders)}` : ""}
                  </span>
                  <b>{money(line.amount)}</b>
                </li>
              ))}
              {config.senders === SENDER_INCLUDED ? (
                <li className="subscribe-line subscribe-line-muted">
                  <span>{t.sendersValue(config.senders)}</span>
                  <b>{t.included}</b>
                </li>
              ) : null}
            </ul>

            <div className="subscribe-total">
              <span>{t.total}</span>
              <p>
                <b>{money(total)}</b>
                <small>{t.perMonth}</small>
              </p>
            </div>
            <p className="subscribe-note">{t.noCharge}</p>
          </div>
        </div>
      </aside>

      <main className="subscribe-main">
        <header className="subscribe-head">
          <div className="subscribe-head-row">
            <a
              className="subscribe-back"
              href="/"
              onClick={(event) => {
                event.preventDefault();
                leaveTo("/");
              }}
            >
              ← {t.back}
            </a>
            <button
              className="landing-lang"
              onClick={() => switchLanguage(language === "ru" ? "en" : "ru")}
              aria-label="Language"
            >
              {language === "ru" ? "EN" : "RU"}
            </button>
          </div>
          <h1 className="subscribe-title">{t.title}</h1>
          <p className="subscribe-sub">{t.sub}</p>
        </header>

        <section className="subscribe-group">
          <h2 className="subscribe-group-title">{t.volumeTitle}</h2>
          <p className="subscribe-group-hint">{t.volumeHint}</p>
          <div className="option-list">
            {VOLUME_ORDER.map((id: VolumeId) => (
              <button
                className="option"
                key={id}
                data-selected={config.volume === id}
                onClick={() => setConfig({ ...config, volume: id })}
              >
                <span className="option-check" aria-hidden />
                <span className="option-body">
                  <b>{t.volumeNames[id]}</b>
                  <em>{t.perDay(VOLUMES[id].dailyProfiles)}</em>
                  <small>{t.volumeBody[id]}</small>
                </span>
                <span className="option-price">{money(VOLUMES[id].price[currency])}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="subscribe-group">
          <h2 className="subscribe-group-title">{t.sendersTitle}</h2>
          <p className="subscribe-group-hint">{t.sendersHint}</p>
          <div className="stepper">
            <button
              className="stepper-button"
              onClick={() => setConfig({ ...config, senders: Math.max(SENDER_INCLUDED, config.senders - 1) })}
              disabled={config.senders <= SENDER_INCLUDED}
              aria-label="−"
            >
              −
            </button>
            <span className="stepper-value">{t.sendersValue(config.senders)}</span>
            <button
              className="stepper-button"
              onClick={() => setConfig({ ...config, senders: Math.min(SENDER_MAX, config.senders + 1) })}
              disabled={config.senders >= SENDER_MAX}
              aria-label="+"
            >
              +
            </button>
            <span className="stepper-note">
              {config.senders === SENDER_INCLUDED
                ? t.sendersIncluded
                : `+${money((config.senders - SENDER_INCLUDED) * SENDER_PRICE[currency])}${t.perMonth}`}
            </span>
          </div>
        </section>

        <section className="subscribe-group">
          <h2 className="subscribe-group-title">{t.depthTitle}</h2>
          <p className="subscribe-group-hint">{t.depthHint}</p>
          <div className="option-list">
            {(["standard", "deep"] as DepthId[]).map((id) => (
              <button
                className="option"
                key={id}
                data-selected={config.depth === id}
                onClick={() => setConfig({ ...config, depth: id })}
              >
                <span className="option-check" aria-hidden />
                <span className="option-body">
                  <b>{t.depthNames[id]}</b>
                  <small>{t.depthBody[id]}</small>
                </span>
                <span className="option-price">
                  {DEPTHS[id].price[currency]
                    ? `+${money(DEPTHS[id].price[currency])}`
                    : t.included}
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="subscribe-group">
          <h2 className="subscribe-group-title">{t.supportTitle}</h2>
          <p className="subscribe-group-hint">{t.supportBody}</p>
          <div className="option-list">
            {[false, true].map((on) => (
              <button
                className="option"
                key={String(on)}
                data-selected={config.prioritySupport === on}
                onClick={() => setConfig({ ...config, prioritySupport: on })}
              >
                <span className="option-check" aria-hidden />
                <span className="option-body">
                  <b>{on ? t.supportOn : t.supportOff}</b>
                </span>
                <span className="option-price">
                  {on ? `+${money(PRIORITY_SUPPORT_PRICE[currency])}` : t.included}
                </span>
              </button>
            ))}
          </div>
        </section>

        <div className="subscribe-actions">
          <button className="btn" onClick={submit} disabled={busy || !ready || (Boolean(saved) && !changed)}>
            {busy ? t.saving : saved ? t.update : t.confirm}
          </button>
          {saved ? (
            <button className="btn btn-ghost" onClick={cancel} disabled={busy}>
              {t.cancel}
            </button>
          ) : null}
        </div>
      </main>
    </div>
  );
}
