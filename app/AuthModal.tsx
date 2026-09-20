"use client";

import { useEffect, useState } from "react";

type Labels = {
  signIn: string;
  signUp: string;
  forgot: string;
  forgotTitle: string;
  forgotBody: string;
  forgotSubmit: string;
  forgotSent: string;
  backToSignIn: string;
  newPassword: string;
  resetTitle: string;
  resetSubmit: string;
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

export type AuthMode = "signin" | "signup" | "forgot" | "reset";

export default function AuthModal({
  mode,
  token,
  onMode,
  onClose,
  onDone,
  labels,
}: {
  mode: AuthMode;
  token?: string;
  onMode: (mode: AuthMode) => void;
  onClose: () => void;
  onDone: (user: { id: string; email: string; emailVerified: boolean }) => void;
  labels: Labels;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
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
    setInfo(null);
    try {
      const body =
        mode === "forgot"
          ? { action: "forgot", email }
          : mode === "reset"
            ? { action: "reset", token, password }
            : { action: mode === "signup" ? "signup" : "signin", email, password };

      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not sign in.");

      if (mode === "forgot") {
        // The answer never says whether the address exists.
        setInfo(labels.forgotSent);
        return;
      }
      onDone(data.user);
    } catch (problem) {
      setError((problem as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const title =
    mode === "forgot" ? labels.forgotTitle : mode === "reset" ? labels.resetTitle : mode === "signup" ? labels.signUp : labels.signIn;

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

        {mode === "forgot" ? <p className="modal-muted">{labels.forgotBody}</p> : null}
        {error ? <div className="notice">{error}</div> : null}
        {info ? <div className="notice">{info}</div> : null}

        {mode !== "reset" ? (
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
        ) : null}

        {mode !== "forgot" ? (
          <label className="field">
            {mode === "reset" ? labels.newPassword : labels.password}
            <input
              type="password"
              required
              minLength={8}
              autoFocus={mode === "reset"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {mode === "signup" || mode === "reset" ? (
              <span className="field-hint">{labels.passwordHint}</span>
            ) : null}
          </label>
        ) : null}

        <button className="btn" type="submit" disabled={busy}>
          {busy
            ? labels.working
            : mode === "forgot"
              ? labels.forgotSubmit
              : mode === "reset"
                ? labels.resetSubmit
                : mode === "signup"
                  ? labels.submitUp
                  : labels.submitIn}
        </button>

        {mode === "signin" ? (
          <button
            type="button"
            className="auth-switch"
            onClick={() => {
              setError(null);
              setInfo(null);
              onMode("forgot");
            }}
          >
            <span>{labels.forgot}</span>
          </button>
        ) : null}

        {mode === "forgot" || mode === "reset" ? (
          <button
            type="button"
            className="auth-switch"
            onClick={() => {
              setError(null);
              setInfo(null);
              onMode("signin");
            }}
          >
            <span>{labels.backToSignIn}</span>
          </button>
        ) : (
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
        )}
      </form>
    </div>
  );
}
