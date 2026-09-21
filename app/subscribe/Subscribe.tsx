"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_CONFIG,
  DEPTHS,
  SENDER_INCLUDED,
  SENDER_MAX,
  SENDER_PRICE,
  VOLUMES,
  VOLUME_ORDER,
  priceLines,
  priceOf,
  type DepthId,
  type SubscriptionConfig,
  type VolumeId,
} from "@/lib/plans";
import { dict, type Language } from "@/lib/i18n";

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
  const t = dict(language).plan;

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("language");
      if (stored === "ru" || stored === "en") setLanguage(stored);
    } catch {
      /* storage can be blocked; English is the default */
    }
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

  const lines = useMemo(() => priceLines(config), [config]);
  const total = useMemo(() => priceOf(config), [config]);
  const changed = useMemo(() => JSON.stringify(saved) !== JSON.stringify(config), [saved, config]);

  const submit = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ config }),
      });
      if (res.ok) window.location.href = "/";
    } finally {
      setBusy(false);
    }
  }, [config]);

  const cancel = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ config: null }),
      });
      if (res.ok) window.location.href = "/";
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <div className="subscribe">
      <aside className="subscribe-aside">
        <div className="subscribe-glow" aria-hidden />
        <div className="subscribe-noise" aria-hidden />

        <div className="subscribe-aside-inner">
          <a className="subscribe-brand" href="/">
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
                  <b>${line.amount}</b>
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
                <b>${total}</b>
                <small>{t.perMonth}</small>
              </p>
            </div>
            <p className="subscribe-note">{t.noCharge}</p>
          </div>
        </div>
      </aside>

      <main className="subscribe-main">
        <header className="subscribe-head">
          <a className="subscribe-back" href="/">
            ← {t.back}
          </a>
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
                <span className="option-price">${VOLUMES[id].price}</span>
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
                : `+$${(config.senders - SENDER_INCLUDED) * SENDER_PRICE}${t.perMonth}`}
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
                  {DEPTHS[id].price ? `+$${DEPTHS[id].price}` : t.included}
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
                <span className="option-price">{on ? "+$15" : t.included}</span>
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
