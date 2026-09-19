"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CATEGORIES, COUNTRIES } from "@/lib/countries";
import { dict, type Language } from "@/lib/i18n";
import type { PublicSettings } from "@/lib/settings";
import type { Influencer, OutreachResult } from "@/lib/types";

type View = "discover" | "selected" | "compose" | "results" | "settings";

const VIEWS: Array<{ id: View; hotkey: string; icon: JSX.Element }> = [
  {
    id: "discover",
    hotkey: "1",
    icon: (
      <svg viewBox="0 0 20 20" aria-hidden>
        <circle cx="9" cy="9" r="5.5" />
        <path d="M13 13l4 4" />
      </svg>
    ),
  },
  {
    id: "selected",
    hotkey: "2",
    icon: (
      <svg viewBox="0 0 20 20" aria-hidden>
        <path d="M3.5 10.5l3.5 3.5 9-9" />
      </svg>
    ),
  },
  {
    id: "compose",
    hotkey: "3",
    icon: (
      <svg viewBox="0 0 20 20" aria-hidden>
        <path d="M13.5 3.5l3 3-9 9H4.5v-3z" />
      </svg>
    ),
  },
  {
    id: "results",
    hotkey: "4",
    icon: (
      <svg viewBox="0 0 20 20" aria-hidden>
        <path d="M4 16V9M10 16V4M16 16v-5" />
      </svg>
    ),
  },
  {
    id: "settings",
    hotkey: "5",
    icon: (
      <svg viewBox="0 0 20 20" aria-hidden>
        <circle cx="10" cy="10" r="2.6" />
        <path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M15.3 4.7l-1.4 1.4M6.1 13.9l-1.4 1.4" />
      </svg>
    ),
  },
];

const EMPTY_SETTINGS: PublicSettings = {
  language: "en",
  email: { host: "", port: 587, user: "", from: "", replyTo: "", hasPassword: false },
  accounts: { instagram: "", telegram: "", tiktok: "", youtube: "", website: "" },
};

function formatFollowers(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1000)}K`;
  return String(n);
}

export default function Page() {
  const [view, setView] = useState<View>("discover");
  const [language, setLanguage] = useState<Language>("en");
  const t = dict(language);

  const [country, setCountry] = useState("US");
  const [category, setCategory] = useState("fashion");
  const [keyword, setKeyword] = useState("");
  const [minFollowers, setMinFollowers] = useState(10_000);
  const [maxFollowers, setMaxFollowers] = useState(500_000);

  const [influencers, setInfluencers] = useState<Influencer[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [templateEdited, setTemplateEdited] = useState(false);
  const [channels, setChannels] = useState({ email: true, instagram: true, other: false });
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState<OutreachResult[]>([]);

  const [settings, setSettings] = useState<PublicSettings>(EMPTY_SETTINGS);
  const [password, setPassword] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);
  const [testing, setTesting] = useState(false);

  const [collapsed, setCollapsed] = useState(false);

  // Keep the untouched template in the active language.
  useEffect(() => {
    if (templateEdited) return;
    setSubject(t.compose.defaultSubject);
    setBody(t.compose.defaultBody);
  }, [t, templateEdited]);

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem("sidebar-collapsed") === "1");
    } catch {
      /* storage can be blocked; the default stays expanded */
    }
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data: PublicSettings) => {
        setSettings(data);
        setLanguage(data.language);
      })
      .catch(() => undefined);
  }, []);

  const toggleSidebar = useCallback(() => {
    setCollapsed((prev) => {
      try {
        window.localStorage.setItem("sidebar-collapsed", prev ? "0" : "1");
      } catch {
        /* ignore */
      }
      return !prev;
    });
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey) {
        if (event.key.toLowerCase() === "b") {
          event.preventDefault();
          toggleSidebar();
        }
        return;
      }
      const target = event.target as HTMLElement | null;
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target?.isContentEditable;
      // Bare digits only work outside a field; Alt+digit works everywhere.
      if (typing && !event.altKey) return;
      const match = VIEWS.find((v) => v.hotkey === event.key);
      if (match) {
        event.preventDefault();
        setView(match.id);
      } else if (event.key === "[" || (event.altKey && event.key.toLowerCase() === "b")) {
        event.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleSidebar]);

  const selected = useMemo(
    () => influencers.filter((i) => selectedIds.includes(i.id)),
    [influencers, selectedIds],
  );

  const search = useCallback(async () => {
    setLoading(true);
    setNotice(null);
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ country, category, keyword, minFollowers, maxFollowers, limit: 30 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Search failed.");
      setInfluencers(data.influencers ?? []);
      setSelectedIds([]);
      setNotice(data.notice ?? null);
      setView("discover");
    } catch (error) {
      setInfluencers([]);
      setNotice((error as Error).message);
    } finally {
      setLoading(false);
    }
  }, [country, category, keyword, minFollowers, maxFollowers]);

  const toggle = (id: string) =>
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const send = useCallback(async () => {
    if (selected.length === 0) return;
    setSending(true);
    setNotice(null);
    try {
      const res = await fetch("/api/outreach", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ influencers: selected, subject, body, channels }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Outreach failed.");
      setResults(data.results ?? []);
      setView("results");
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      setSending(false);
    }
  }, [selected, subject, body, channels]);

  const saveSettings = useCallback(async () => {
    setSavingSettings(true);
    setNotice(null);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          language,
          email: { ...settings.email, pass: password },
          accounts: settings.accounts,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not save settings.");
      setSettings(data);
      setPassword("");
      setNotice(t.settings.saved);
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      setSavingSettings(false);
    }
  }, [language, settings, password, t]);

  const testEmail = useCallback(async () => {
    setTesting(true);
    setNotice(null);
    try {
      const res = await fetch("/api/settings/test", { method: "POST" });
      const data = await res.json();
      setNotice(data.detail ?? (res.ok ? "ok" : "failed"));
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      setTesting(false);
    }
  }, []);

  const setEmailField = (key: keyof PublicSettings["email"], value: string | number) =>
    setSettings((prev) => ({ ...prev, email: { ...prev.email, [key]: value } }));

  const setAccount = (key: keyof PublicSettings["accounts"], value: string) =>
    setSettings((prev) => ({ ...prev, accounts: { ...prev.accounts, [key]: value } }));

  const counts: Record<View, number | undefined> = {
    discover: influencers.length || undefined,
    selected: selectedIds.length || undefined,
    compose: undefined,
    results: results.length || undefined,
    settings: undefined,
  };

  const composeMode = view === "compose" || view === "settings";

  return (
    <div className="shell">
      <aside className="sidebar" data-collapsed={collapsed}>
        <button
          className="brand"
          onClick={toggleSidebar}
          title={`${collapsed ? t.nav.expand : t.nav.collapse} · ⌘B`}
          aria-label={collapsed ? t.nav.expand : t.nav.collapse}
        >
          <span className="brand-mark-wrap">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="brand-mark" src="/iconinfluence.png" alt="InstaInfluence" />
            <span className="brand-collapse" aria-hidden>
              <svg viewBox="0 0 20 20">
                <path d={collapsed ? "M8 5l5 5-5 5" : "M12 5l-5 5 5 5"} />
              </svg>
            </span>
          </span>
          {collapsed ? null : <span className="brand-name">InstaInfluence</span>}
        </button>

        <nav className="nav">
          {VIEWS.map((item) => (
            <button
              key={item.id}
              className="nav-item"
              aria-current={view === item.id}
              title={`${t.nav[item.id]} · ${item.hotkey}`}
              onClick={() => setView(item.id)}
            >
              <span className="nav-icon">
                {item.icon}
                {collapsed && counts[item.id] ? <span className="nav-badge" /> : null}
              </span>
              {collapsed ? null : (
                <>
                  <span className="nav-label">{t.nav[item.id]}</span>
                  {counts[item.id] ? <span className="nav-count">{counts[item.id]}</span> : null}
                  <kbd className="nav-key">{item.hotkey}</kbd>
                </>
              )}
            </button>
          ))}
        </nav>
      </aside>

      <main className="main">
        <div className="content">
          {notice ? <div className="notice">{notice}</div> : null}

          {view === "discover" ? (
            <>
              <h1 className="view-title">{t.discover.title}</h1>
              <p className="view-sub">{t.discover.sub}</p>
              {influencers.length === 0 ? (
                <div className="empty">{loading ? t.discover.loading : t.discover.empty}</div>
              ) : (
                <div className="grid">
                  {influencers.map((influencer) => (
                    <InfluencerCard
                      key={influencer.id}
                      influencer={influencer}
                      selected={selectedIds.includes(influencer.id)}
                      onToggle={() => toggle(influencer.id)}
                      labels={t.discover}
                    />
                  ))}
                </div>
              )}
            </>
          ) : null}

          {view === "selected" ? (
            <>
              <h1 className="view-title">{t.selected.title}</h1>
              <p className="view-sub">{t.selected.sub(selected.length)}</p>
              {selected.length === 0 ? (
                <div className="empty">{t.selected.empty}</div>
              ) : (
                <div className="grid">
                  {selected.map((influencer) => (
                    <InfluencerCard
                      key={influencer.id}
                      influencer={influencer}
                      selected
                      onToggle={() => toggle(influencer.id)}
                      labels={t.discover}
                    />
                  ))}
                </div>
              )}
            </>
          ) : null}

          {view === "compose" ? (
            <>
              <h1 className="view-title">{t.compose.title}</h1>
              <p className="view-sub">
                {t.compose.sub} {"{{name}}"}, {"{{username}}"}, {"{{followers}}"}, {"{{category}}"},{" "}
                {"{{city}}"}, {"{{country}}"}.
              </p>
              <div className="compose">
                <div className="toggles">
                  {(["email", "instagram", "other"] as const).map((channel) => (
                    <button
                      key={channel}
                      className="toggle"
                      aria-pressed={channels[channel]}
                      onClick={() => setChannels((c) => ({ ...c, [channel]: !c[channel] }))}
                    >
                      {t.compose[channel]}
                    </button>
                  ))}
                </div>
                <label className="field">
                  {t.compose.subject}
                  <input
                    value={subject}
                    onChange={(e) => {
                      setTemplateEdited(true);
                      setSubject(e.target.value);
                    }}
                  />
                </label>
                <label className="field">
                  {t.compose.message}
                  <textarea
                    rows={12}
                    value={body}
                    onChange={(e) => {
                      setTemplateEdited(true);
                      setBody(e.target.value);
                    }}
                  />
                </label>
                <p className="hint">{t.compose.hint}</p>
              </div>
            </>
          ) : null}

          {view === "results" ? (
            <>
              <h1 className="view-title">{t.results.title}</h1>
              <p className="view-sub">
                {results.filter((r) => r.status === "sent").length} {t.results.sent} ·{" "}
                {results.filter((r) => r.status === "drafted").length} {t.results.drafted} ·{" "}
                {results.filter((r) => r.status === "skipped").length} {t.results.skipped} ·{" "}
                {results.filter((r) => r.status === "failed").length} {t.results.failed}
              </p>
              {results.length === 0 ? (
                <div className="empty">{t.results.empty}</div>
              ) : (
                <div className="rows">
                  {results.map((result, index) => (
                    <div className="row" key={`${result.influencerId}-${result.channel}-${index}`}>
                      <span>@{result.username}</span>
                      <span className="muted">{result.channel}</span>
                      {result.target.startsWith("http") ? (
                        <a className="chip" href={result.target} target="_blank" rel="noreferrer">
                          {t.results.open}
                        </a>
                      ) : (
                        <span className="muted" title={result.detail}>
                          {result.target}
                        </span>
                      )}
                      <span className="status" data-status={result.status}>
                        {t.results[result.status]}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : null}

          {view === "settings" ? (
            <>
              <h1 className="view-title">{t.settings.title}</h1>
              <p className="view-sub">{t.settings.sub}</p>
              <div className="compose">
                <section className="panel">
                  <h2 className="panel-title">{t.settings.language}</h2>
                  <div className="toggles">
                    {(["en", "ru"] as const).map((code) => (
                      <button
                        key={code}
                        className="toggle"
                        aria-pressed={language === code}
                        onClick={() => setLanguage(code)}
                      >
                        {code.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </section>

                <section className="panel">
                  <h2 className="panel-title">{t.settings.emailSection}</h2>
                  <p className="hint">{t.settings.emailHint}</p>
                  <div className="form-grid">
                    <label className="field" style={{ gridColumn: "span 2" }}>
                      {t.settings.host}
                      <input
                        value={settings.email.host}
                        placeholder="smtp.resend.com"
                        onChange={(e) => setEmailField("host", e.target.value)}
                      />
                    </label>
                    <label className="field">
                      {t.settings.port}
                      <input
                        type="number"
                        value={settings.email.port}
                        onChange={(e) => setEmailField("port", Number(e.target.value))}
                      />
                    </label>
                    <label className="field">
                      {t.settings.user}
                      <input
                        value={settings.email.user}
                        onChange={(e) => setEmailField("user", e.target.value)}
                      />
                    </label>
                    <label className="field" style={{ gridColumn: "span 2" }}>
                      {t.settings.password}
                      <input
                        type="password"
                        value={password}
                        placeholder={settings.email.hasPassword ? t.settings.passwordStored : ""}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                    </label>
                    <label className="field" style={{ gridColumn: "span 2" }}>
                      {t.settings.from}
                      <input
                        value={settings.email.from}
                        placeholder={t.settings.fromPlaceholder}
                        onChange={(e) => setEmailField("from", e.target.value)}
                      />
                    </label>
                    <label className="field" style={{ gridColumn: "span 2" }}>
                      {t.settings.replyTo}
                      <input
                        value={settings.email.replyTo}
                        onChange={(e) => setEmailField("replyTo", e.target.value)}
                      />
                    </label>
                  </div>
                </section>

                <section className="panel">
                  <h2 className="panel-title">{t.settings.accountsSection}</h2>
                  <p className="hint">{t.settings.accountsHint}</p>
                  <div className="form-grid">
                    {(["instagram", "telegram", "tiktok", "youtube", "website"] as const).map(
                      (key) => (
                        <label className="field" key={key} style={{ gridColumn: "span 2" }}>
                          {t.settings[key]}
                          <input
                            value={settings.accounts[key]}
                            placeholder={key === "website" ? "https://" : "@handle"}
                            onChange={(e) => setAccount(key, e.target.value)}
                          />
                        </label>
                      ),
                    )}
                  </div>
                </section>
              </div>
            </>
          ) : null}
        </div>

        <div className="dock">
          {view === "discover" || view === "selected" ? (
            <>
              <div className="dock-fields">
                <label className="field">
                  {t.discover.geo}
                  <select value={country} onChange={(e) => setCountry(e.target.value)}>
                    {COUNTRIES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.flag} {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  {t.discover.niche}
                  <select value={category} onChange={(e) => setCategory(e.target.value)}>
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  {t.discover.keyword}
                  <input
                    value={keyword}
                    placeholder={t.discover.keywordPlaceholder}
                    onChange={(e) => setKeyword(e.target.value)}
                  />
                </label>
                <label className="field">
                  {t.discover.minFollowers}
                  <input
                    type="number"
                    min={0}
                    step={1000}
                    value={minFollowers}
                    onChange={(e) => setMinFollowers(Number(e.target.value))}
                  />
                </label>
                <label className="field">
                  {t.discover.maxFollowers}
                  <input
                    type="number"
                    min={0}
                    step={1000}
                    value={maxFollowers}
                    onChange={(e) => setMaxFollowers(Number(e.target.value))}
                  />
                </label>
              </div>
              <div className="dock-actions">
                <span className="dock-status">{t.discover.selectedCount(selectedIds.length)}</span>
                <button
                  className="btn btn-ghost"
                  onClick={() => setSelectedIds(influencers.map((i) => i.id))}
                  disabled={influencers.length === 0}
                >
                  {t.discover.selectAll}
                </button>
                <button className="btn" onClick={search} disabled={loading}>
                  {loading ? t.discover.parsing : t.discover.parse}
                </button>
              </div>
            </>
          ) : null}

          {view === "compose" ? (
            <>
              <div className="dock-fields" style={{ gridTemplateColumns: "1fr" }}>
                <span className="dock-status">
                  {t.compose.recipients(selected.length)} ·{" "}
                  {Object.entries(channels)
                    .filter(([, on]) => on)
                    .map(([name]) => t.compose[name as "email" | "instagram" | "other"])
                    .join(", ") || t.compose.noChannel}
                </span>
              </div>
              <div className="dock-actions">
                <button className="btn btn-ghost" onClick={() => setView("selected")}>
                  {t.compose.back}
                </button>
                <button className="btn" onClick={send} disabled={sending || selected.length === 0}>
                  {sending ? t.compose.sending : t.compose.send}
                </button>
              </div>
            </>
          ) : null}

          {view === "settings" ? (
            <>
              <div className="dock-fields" style={{ gridTemplateColumns: "1fr" }}>
                <span className="dock-status">
                  {settings.email.hasPassword && settings.email.host
                    ? `${settings.email.from || settings.email.user}`
                    : t.settings.emailSection}
                </span>
              </div>
              <div className="dock-actions">
                <button className="btn btn-ghost" onClick={testEmail} disabled={testing}>
                  {testing ? t.settings.testing : t.settings.test}
                </button>
                <button className="btn" onClick={saveSettings} disabled={savingSettings}>
                  {savingSettings ? t.settings.saving : t.settings.save}
                </button>
              </div>
            </>
          ) : null}

          {view === "results" ? (
            <div className="dock-fields" style={{ gridTemplateColumns: "1fr" }}>
              <span className="dock-status">{t.results.title}</span>
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}

function InfluencerCard({
  influencer,
  selected,
  onToggle,
  labels,
}: {
  influencer: Influencer;
  selected: boolean;
  onToggle: () => void;
  labels: { followers: string; engagement: string; nicheLabel: string };
}) {
  return (
    <div
      className="card"
      data-selected={selected}
      role="checkbox"
      aria-checked={selected}
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggle();
        }
      }}
    >
      <div className="card-head">
        <div>
          <div className="handle">@{influencer.username}</div>
          <div className="card-name">
            {influencer.fullName}
            {influencer.city ? ` · ${influencer.city}` : ""}
          </div>
        </div>
        <span className="checkbox">✓</span>
      </div>

      <div className="stats">
        <div>
          <div className="stat-value">{formatFollowers(influencer.followers)}</div>
          <div className="stat-label">{labels.followers}</div>
        </div>
        {influencer.engagementRate > 0 ? (
          <div>
            <div className="stat-value">{influencer.engagementRate}%</div>
            <div className="stat-label">{labels.engagement}</div>
          </div>
        ) : null}
        <div>
          <div className="stat-value">{influencer.category}</div>
          <div className="stat-label">{labels.nicheLabel}</div>
        </div>
      </div>

      {influencer.biography ? <div className="bio">{influencer.biography}</div> : null}

      <div className="chips" onClick={(e) => e.stopPropagation()}>
        {influencer.emails.map((email) => (
          <a key={email} className="chip chip-mail" href={`mailto:${email}`}>
            {email}
          </a>
        ))}
        {influencer.phones.map((phone) => (
          <span key={phone} className="chip">
            {phone}
          </span>
        ))}
        <a className="chip" href={influencer.profileUrl} target="_blank" rel="noreferrer">
          instagram
        </a>
        {influencer.links
          .filter((l) => l.platform !== "instagram")
          .map((link) => (
            <a key={link.url} className="chip" href={link.url} target="_blank" rel="noreferrer">
              {link.platform}
            </a>
          ))}
      </div>
    </div>
  );
}
