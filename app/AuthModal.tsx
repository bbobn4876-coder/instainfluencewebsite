"use client";

import { useEffect, useState } from "react";

/** How long each benefit stays on screen. */
const PERK_MS = 4200;

type Labels = {
  perks: readonly { title: string; body: string }[];
  signIn: string;
  signUp: string;
  email: string;
  password: string;
  passwordHint: string;
  haveAccount: string;
  noAccount: string;
  submitIn: string;
  submitUp: string;
  working: string;
  close: string;
};

export type AuthMode = "signin" | "signup";

export default function AuthModal({
  mode,
  onMode,
  onClose,
  onDone,
  labels,
}: {
  mode: AuthMode;
  onMode: (mode: AuthMode) => void;
  onClose: () => void;
  onDone: (user: { id: string; email: string }) => void;
  labels: Labels;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [perk, setPerk] = useState(0);

  useEffect(() => {
    if (labels.perks.length < 2) return;
    const timer = window.setInterval(
      () => setPerk((current) => (current + 1) % labels.perks.length),
      PERK_MS,
    );
    return () => window.clearInterval(timer);
  }, [labels.perks.length]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: mode === "signup" ? "signup" : "signin", email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not sign in.");
      onDone(data.user);
    } catch (problem) {
      setError((problem as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const title = mode === "signup" ? labels.signUp : labels.signIn;

  return (
    /* No click-through close here: losing a half-typed password to a stray
       click on the backdrop is worse than having to aim for the cross. */
    <div className="modal-backdrop" role="presentation">
      <div className="auth-dialog" role="dialog" aria-modal aria-label={title}>
        <aside className="auth-aside">
          <div className="subscribe-glow" aria-hidden />
          <div className="subscribe-noise" aria-hidden />

          <div className="auth-aside-inner">
            <div className="auth-brand">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/iconinfluence.png" alt="" />
              <span>Loomera</span>
            </div>

            <div className="auth-perks">
              <div className="auth-perk" key={perk}>
                <h3>{labels.perks[perk]?.title}</h3>
                <p>{labels.perks[perk]?.body}</p>
              </div>
              <div className="auth-dots">
                {labels.perks.map((item, index) => (
                  <button
                    type="button"
                    key={item.title}
                    className="auth-dot"
                    data-active={index === perk}
                    aria-label={item.title}
                    onClick={() => setPerk(index)}
                  />
                ))}
              </div>
            </div>
          </div>
        </aside>

        <form className="auth-form" onSubmit={submit}>
          <button type="button" className="modal-close" onClick={onClose} aria-label={labels.close}>
            <svg viewBox="0 0 20 20" aria-hidden>
              <path d="M5 5l10 10M15 5L5 15" />
            </svg>
          </button>

          <h2 className="auth-title">{title}</h2>

          {error ? <div className="notice">{error}</div> : null}

          <label className="field">
            {labels.email}
            <input
              type="email"
              autoFocus
              required
              value={email}
              placeholder="you@domain.com"
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>

          <label className="field">
            {labels.password}
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {mode === "signup" ? <span className="field-hint">{labels.passwordHint}</span> : null}
          </label>

          <button className="btn auth-submit" type="submit" disabled={busy}>
            {busy ? labels.working : mode === "signup" ? labels.submitUp : labels.submitIn}
          </button>

          {/* The other way in sits beside the primary action rather than
              under it as small print: same size, quieter colour. */}
          <button
            type="button"
            className="btn auth-alt"
            onClick={() => {
              setError(null);
              onMode(mode === "signup" ? "signin" : "signup");
            }}
          >
            {mode === "signup" ? labels.signIn : labels.signUp}
          </button>
        </form>
      </div>
    </div>
  );
}
