"use client";

import { useEffect, useState } from "react";

type Labels = {
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
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <form
        className="modal auth-modal"
        onClick={(event) => event.stopPropagation()}
        onSubmit={submit}
      >
        <button type="button" className="modal-close" onClick={onClose} aria-label={labels.close}>
          <svg viewBox="0 0 20 20" aria-hidden>
            <path d="M5 5l10 10M15 5L5 15" />
          </svg>
        </button>

        <h2 className="modal-title">{title}</h2>

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

        <button className="btn" type="submit" disabled={busy}>
          {busy ? labels.working : mode === "signup" ? labels.submitUp : labels.submitIn}
        </button>

        <button
          type="button"
          className="auth-switch"
          onClick={() => {
            setError(null);
            onMode(mode === "signup" ? "signin" : "signup");
          }}
        >
          {mode === "signup" ? labels.haveAccount : labels.noAccount}{" "}
          <span>{mode === "signup" ? labels.signIn : labels.signUp}</span>
        </button>
      </form>
    </div>
  );
}
