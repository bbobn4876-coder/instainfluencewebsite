"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ALL, CATEGORIES, COUNTRIES } from "@/lib/countries";
import { dict, type Language } from "@/lib/i18n";
import { MAIL_PROVIDERS, guessProvider, providerById } from "@/lib/mailProviders";
import Select from "./Select";
import ProfileModal from "./ProfileModal";
import TokenEditor from "./TokenEditor";
import { TOKENS } from "@/lib/tokens";
import type { PublicSettings } from "@/lib/settings";
import type { InboxChannel, InboxMessage, ChannelStatus } from "@/lib/inbox";
import type { Influencer, OutreachResult } from "@/lib/types";

type View = "discover" | "compose" | "results" | "inbox" | "settings";

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
    id: "compose",
    hotkey: "2",
    icon: (
      <svg viewBox="0 0 20 20" aria-hidden>
        <path d="M13.5 3.5l3 3-9 9H4.5v-3z" />
      </svg>
    ),
  },
  {
    id: "results",
    hotkey: "3",
    icon: (
      <svg viewBox="0 0 20 20" aria-hidden>
        <path d="M4 16V9M10 16V4M16 16v-5" />
      </svg>
    ),
  },
  {
    id: "inbox",
    hotkey: "4",
    icon: (
      <svg viewBox="0 0 20 20" aria-hidden>
        <path d="M2.8 5.5h14.4v9H2.8z" />
        <path d="M2.8 6l7.2 5 7.2-5" />
      </svg>
    ),
  },
  {
    id: "settings",
    hotkey: "5",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden>
        <circle cx="12" cy="12" r="3.1" />
        <path d="M19.4 14.5a1.6 1.6 0 00.3 1.8l.1.1a1.9 1.9 0 11-2.7 2.7l-.1-.1a1.6 1.6 0 00-1.8-.3 1.6 1.6 0 00-1 1.5v.2a1.9 1.9 0 11-3.8 0v-.1a1.6 1.6 0 00-1-1.5 1.6 1.6 0 00-1.8.3l-.1.1a1.9 1.9 0 11-2.7-2.7l.1-.1a1.6 1.6 0 00.3-1.8 1.6 1.6 0 00-1.5-1H3.4a1.9 1.9 0 110-3.8h.1a1.6 1.6 0 001.5-1 1.6 1.6 0 00-.3-1.8l-.1-.1a1.9 1.9 0 112.7-2.7l.1.1a1.6 1.6 0 001.8.3h.1a1.6 1.6 0 001-1.5V3.4a1.9 1.9 0 113.8 0v.1a1.6 1.6 0 001 1.5 1.6 1.6 0 001.8-.3l.1-.1a1.9 1.9 0 112.7 2.7l-.1.1a1.6 1.6 0 00-.3 1.8v.1a1.6 1.6 0 001.5 1h.2a1.9 1.9 0 110 3.8h-.1a1.6 1.6 0 00-1.5 1z" />
      </svg>
    ),
  },
];

const EMPTY_SETTINGS: PublicSettings = {
  language: "en",
  email: { host: "", port: 587, user: "", from: "", replyTo: "", hasPassword: false },
  imap: { host: "", port: 993, user: "", hasPassword: false },
  accounts: { instagram: "", telegram: "", tiktok: "", youtube: "", website: "" },
  hasTelegramBot: false,
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

  const [countries, setCountries] = useState<string[]>(["US"]);
  const [categories, setCategories] = useState<string[]>(["fashion"]);
  const [keyword, setKeyword] = useState("");
  const [minFollowers, setMinFollowers] = useState(10_000);
  const [maxFollowers, setMaxFollowers] = useState(500_000);

  const [influencers, setInfluencers] = useState<Influencer[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [onlySelected, setOnlySelected] = useState(false);
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

  const [inbox, setInbox] = useState<InboxMessage[]>([]);
  const [inboxChannels, setInboxChannels] = useState<ChannelStatus[]>([]);
  const [inboxFilter, setInboxFilter] = useState<InboxChannel | "all">("all");
  const [inboxLoading, setInboxLoading] = useState(false);
  const [inboxLoaded, setInboxLoaded] = useState(false);
  const [telegramBot, setTelegramBot] = useState("");
  const [providerId, setProviderId] = useState("custom");
  const [imapPassword, setImapPassword] = useState("");

  const [details, setDetails] = useState<Influencer | null>(null);

  const [collapsed, setCollapsed] = useState(false);
  // The bottom bar folds into round icons while scrolling down through a page.
  const [dockCompact, setDockCompact] = useState(false);
  const lastScroll = useRef(0);

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
        const known = MAIL_PROVIDERS.find(
          (p) => p.id !== "custom" && p.smtp.host === data.email.host,
        );
        if (known) setProviderId(known.id);
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
        body: JSON.stringify({
          countries,
          categories,
          keyword,
          minFollowers,
          maxFollowers,
          limit: 30,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Search failed.");
      setInfluencers(data.influencers ?? []);
      setSelectedIds([]);
      setOnlySelected(false);
      setNotice(data.notice ?? null);
      setView("discover");
    } catch (error) {
      setInfluencers([]);
      setNotice((error as Error).message);
    } finally {
      setLoading(false);
    }
  }, [countries, categories, keyword, minFollowers, maxFollowers]);

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

  const loadInbox = useCallback(async () => {
    setInboxLoading(true);
    setNotice(null);
    try {
      const res = await fetch("/api/inbox");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not load the inbox.");
      setInbox(data.messages ?? []);
      setInboxChannels(data.channels ?? []);
      setInboxLoaded(true);
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      setInboxLoading(false);
    }
  }, []);

  // Fetch on the first visit to the page; refreshing afterwards is manual.
  useEffect(() => {
    if (view === "inbox" && !inboxLoaded && !inboxLoading) void loadInbox();
  }, [view, inboxLoaded, inboxLoading, loadInbox]);

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
          imap: { ...settings.imap, pass: imapPassword },
          telegramBotToken: telegramBot,
          accounts: settings.accounts,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not save settings.");
      setSettings(data);
      setPassword("");
      setImapPassword("");
      setTelegramBot("");
      setNotice(t.settings.saved);
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      setSavingSettings(false);
    }
  }, [language, settings, password, imapPassword, telegramBot, t]);

  const disconnect = useCallback(async () => {
    if (!window.confirm(t.settings.disconnectConfirm)) return;
    setSavingSettings(true);
    setNotice(null);
    try {
      const res = await fetch("/api/settings", { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not disconnect.");
      setSettings(data);
      setPassword("");
      setImapPassword("");
      setTelegramBot("");
      setProviderId("custom");
      setInbox([]);
      setInboxLoaded(false);
      setNotice(t.settings.disconnected);
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      setSavingSettings(false);
    }
  }, [t]);

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

  const applyProvider = (id: string, address = settings.email.from || settings.email.user) => {
    setProviderId(id);
    const preset = providerById(id);
    if (!preset || id === "custom") return;
    const login = preset.fixedUser ?? address;
    setSettings((prev) => ({
      ...prev,
      email: {
        ...prev.email,
        host: preset.smtp.host,
        port: preset.smtp.port,
        user: login,
        from: prev.email.from || address,
      },
      imap: {
        ...prev.imap,
        host: preset.imap.host,
        port: preset.imap.port,
        // A send-only provider has no IMAP; keep the address for the login anyway.
        user: preset.fixedUser ? address : login,
      },
    }));
  };

  // One address field drives the sender, both logins and the provider guess.
  const setAddress = (address: string) => {
    const preset = providerById(providerId);
    const login = preset?.fixedUser ?? address;
    setSettings((prev) => ({
      ...prev,
      email: { ...prev.email, user: login, from: address },
      imap: { ...prev.imap, user: address },
    }));
    if (providerId === "custom") {
      const guess = guessProvider(address);
      if (guess) applyProvider(guess.id, address);
    }
  };

  // One password field feeds both SMTP and IMAP unless they were set apart.
  const setBothPasswords = (value: string) => {
    setPassword(value);
    setImapPassword(value);
  };

  const setImapField = (key: keyof PublicSettings["imap"], value: string | number) =>
    setSettings((prev) => ({ ...prev, imap: { ...prev.imap, [key]: value } }));

  const setAccount = (key: keyof PublicSettings["accounts"], value: string) =>
    setSettings((prev) => ({ ...prev, accounts: { ...prev.accounts, [key]: value } }));

  const counts: Record<View, number | undefined> = {
    discover: influencers.length || undefined,
    compose: undefined,
    results: results.length || undefined,
    inbox: inbox.filter((m) => m.unread).length || undefined,
    settings: undefined,
  };

  const currentProvider = providerById(providerId);
  // Providers with a fixed login (Resend, SendGrid) keep the address in `from`
  // only — showing `user` there would put "resend" in the address field.
  const addressValue = currentProvider?.fixedUser
    ? settings.email.from
    : settings.email.from || settings.email.user;
  const addressExample = currentProvider?.fixedUser
    ? "you@yourdomain.com"
    : (currentProvider?.example.user ?? "you@yourdomain.com");

  const emailReady = Boolean(settings.email.host && settings.email.user && settings.email.hasPassword);

  const visibleInfluencers = onlySelected ? selected : influencers;

  const foldableDock = view === "discover" || view === "settings";

  const onContentScroll = (event: React.UIEvent<HTMLDivElement>) => {
    if (!foldableDock) return;
    const top = event.currentTarget.scrollTop;
    const delta = top - lastScroll.current;
    if (Math.abs(delta) < 6) return;
    lastScroll.current = top;
    setDockCompact(top > 40 && delta > 0);
  };

  useEffect(() => {
    lastScroll.current = 0;
    setDockCompact(false);
  }, [view]);

  const visibleInbox =
    inboxFilter === "all" ? inbox : inbox.filter((m) => m.channel === inboxFilter);

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
            <img className="brand-mark" src="/iconinfluence.png" alt="Loomera" />
            <span className="brand-collapse" aria-hidden>
              <svg viewBox="0 0 20 20">
                <path d={collapsed ? "M8 5l5 5-5 5" : "M12 5l-5 5 5 5"} />
              </svg>
            </span>
          </span>
          {collapsed ? null : <span className="brand-name">Loomera</span>}
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
        <div className="content" key={view} onScroll={onContentScroll}>
          {notice ? <div className="notice">{notice}</div> : null}

          {view === "discover" ? (
            <>
              <h1 className="view-title">{t.discover.title}</h1>
              <p className="view-sub">{t.discover.sub}</p>

              {influencers.length > 0 ? (
                <div className="toggles inbox-filters">
                  <button
                    className="toggle"
                    aria-pressed={!onlySelected}
                    onClick={() => setOnlySelected(false)}
                  >
                    {t.discover.filterAll}
                    <span className="toggle-count">{influencers.length}</span>
                  </button>
                  <button
                    className="toggle"
                    aria-pressed={onlySelected}
                    onClick={() => setOnlySelected(true)}
                  >
                    {t.discover.filterSelected}
                    <span className="toggle-count">{selectedIds.length}</span>
                  </button>
                </div>
              ) : null}

              {influencers.length === 0 ? (
                <div className="empty">{loading ? t.discover.loading : t.discover.empty}</div>
              ) : visibleInfluencers.length === 0 ? (
                <div className="empty">{t.discover.emptySelected}</div>
              ) : (
                <div className="grid">
                  {visibleInfluencers.map((influencer) => (
                    <InfluencerCard
                      key={influencer.id}
                      influencer={influencer}
                      selected={selectedIds.includes(influencer.id)}
                      onToggle={() => toggle(influencer.id)}
                      onInfo={() => setDetails(influencer)}
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
                {t.compose.sub}{" "}
                <span className="token-words">
                  {TOKENS.map((token) => (
                    <span className="token-word" key={token.id}>
                      {token.words[language]}
                    </span>
                  ))}
                </span>
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
                <div className="field">
                  {t.compose.subject}
                  <TokenEditor
                    singleLine
                    value={subject}
                    onChange={(next) => {
                      setTemplateEdited(true);
                      setSubject(next);
                    }}
                  />
                </div>
                <div className="field">
                  {t.compose.message}
                  <TokenEditor
                    rows={12}
                    value={body}
                    onChange={(next) => {
                      setTemplateEdited(true);
                      setBody(next);
                    }}
                  />
                </div>
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

          {view === "inbox" ? (
            <>
              <h1 className="view-title">{t.inbox.title}</h1>
              <p className="view-sub">{t.inbox.sub}</p>
              <div className="toggles inbox-filters">
                {(["all", "email", "instagram", "telegram"] as const).map((channel) => {
                  const status =
                    channel === "all"
                      ? undefined
                      : inboxChannels.find((c) => c.channel === channel);
                  const count =
                    channel === "all"
                      ? inbox.length
                      : inbox.filter((m) => m.channel === channel).length;
                  return (
                    <button
                      key={channel}
                      className="toggle"
                      aria-pressed={inboxFilter === channel}
                      title={status && !status.connected ? status.detail : undefined}
                      onClick={() => setInboxFilter(channel)}
                    >
                      {t.inbox[channel]}
                      <span className="toggle-count">
                        {status && !status.connected ? "—" : count}
                      </span>
                    </button>
                  );
                })}
              </div>

              {inboxLoading && inbox.length === 0 ? (
                <div className="empty">{t.inbox.loading}</div>
              ) : visibleInbox.length === 0 ? (
                <div className="empty">
                  {inboxFilter !== "all" &&
                  inboxChannels.find((c) => c.channel === inboxFilter && !c.connected)
                    ? `${t.inbox.notConnected} — ${
                        inboxChannels.find((c) => c.channel === inboxFilter)?.detail ?? ""
                      }`
                    : t.inbox.empty}
                </div>
              ) : (
                <div className="messages">
                  {visibleInbox.map((message) => (
                    <article className="message" key={message.id} data-unread={message.unread}>
                      <div className="message-head">
                        <span className="message-from">{message.from}</span>
                        <span className="chip">{t.inbox[message.channel]}</span>
                        <time className="message-date">
                          {new Date(message.date).toLocaleString(
                            language === "ru" ? "ru-RU" : "en-GB",
                            { dateStyle: "short", timeStyle: "short" },
                          )}
                        </time>
                      </div>
                      {message.subject ? (
                        <div className="message-subject">{message.subject}</div>
                      ) : null}
                      <p className="message-preview">{message.preview}</p>
                      {message.link ? (
                        <a className="chip" href={message.link} target="_blank" rel="noreferrer">
                          {t.inbox.open}
                        </a>
                      ) : null}
                    </article>
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

                  <div className="toggles">
                    {MAIL_PROVIDERS.map((provider) => (
                      <button
                        key={provider.id}
                        className="toggle"
                        aria-pressed={providerId === provider.id}
                        onClick={() => applyProvider(provider.id)}
                      >
                        {provider.label}
                      </button>
                    ))}
                  </div>

                  <div className="form-grid">
                    <label className="field" style={{ gridColumn: "span 2" }}>
                      {t.settings.address}
                      <input
                        type="email"
                        value={addressValue}
                        placeholder={addressExample}
                        onChange={(e) => setAddress(e.target.value)}
                      />
                      <span className="field-hint">
                        {t.settings.addressHint} {t.settings.example}: <code>{addressExample}</code>
                      </span>
                    </label>
                    <label className="field" style={{ gridColumn: "span 2" }}>
                      {t.settings.appPassword}
                      <input
                        type="password"
                        value={password}
                        placeholder={
                          settings.email.hasPassword
                            ? t.settings.passwordStored
                            : (currentProvider?.example.pass ?? "")
                        }
                        onChange={(e) => setBothPasswords(e.target.value)}
                      />
                      <span className="field-hint">
                        {currentProvider?.fixedUser
                          ? t.settings.appPasswordKey
                          : t.settings.appPasswordWhat}{" "}
                        {t.settings.example}: <code>{currentProvider?.example.pass ?? ""}</code>
                      </span>
                    </label>
                  </div>

                  <div className="panel-foot">
                    <span className="status" data-status={emailReady ? "sent" : "drafted"}>
                      {emailReady ? t.settings.connected : t.settings.notConnectedYet}
                    </span>
                    {providerById(providerId)?.passwordUrl ? (
                      <a
                        className="chip"
                        href={providerById(providerId)!.passwordUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {t.settings.getPassword}
                      </a>
                    ) : null}
                  </div>

                  <details className="advanced">
                    <summary>{t.settings.advanced}</summary>
                    <div className="form-grid">
                      <label className="field" style={{ gridColumn: "span 2" }}>
                        {t.settings.host}
                        <input
                          value={settings.email.host}
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
                        {t.settings.userField}
                        <input
                          value={settings.email.user}
                          placeholder={currentProvider?.example.user ?? ""}
                          onChange={(e) => setEmailField("user", e.target.value)}
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
                    <p className="hint">{t.settings.userHint}</p>
                  </details>
                </section>

                <section className="panel">
                  <h2 className="panel-title">{t.settings.imapSection}</h2>
                  <p className="hint">{t.settings.imapHint}</p>
                  <div className="form-grid">
                    <label className="field" style={{ gridColumn: "span 2" }}>
                      {t.settings.imapHost}
                      <input
                        value={settings.imap.host}
                        placeholder="imap.gmail.com"
                        onChange={(e) => setImapField("host", e.target.value)}
                      />
                    </label>
                    <label className="field">
                      {t.settings.port}
                      <input
                        type="number"
                        value={settings.imap.port}
                        onChange={(e) => setImapField("port", Number(e.target.value))}
                      />
                    </label>
                    <label className="field">
                      {t.settings.user}
                      <input
                        value={settings.imap.user}
                        onChange={(e) => setImapField("user", e.target.value)}
                      />
                    </label>
                    <label className="field" style={{ gridColumn: "span 2" }}>
                      {t.settings.password}
                      <input
                        type="password"
                        value={imapPassword}
                        placeholder={settings.imap.hasPassword ? t.settings.passwordStored : ""}
                        onChange={(e) => setImapPassword(e.target.value)}
                      />
                    </label>
                  </div>
                </section>

                <section className="panel">
                  <h2 className="panel-title">{t.settings.disconnect}</h2>
                  <p className="hint">{t.settings.disconnectHint}</p>
                  <div className="panel-foot">
                    <button className="btn btn-danger" onClick={disconnect} disabled={savingSettings}>
                      {t.settings.disconnect}
                    </button>
                  </div>
                </section>

                <section className="panel">
                  <h2 className="panel-title">Telegram</h2>
                  <p className="hint">{t.settings.telegramBotHint}</p>
                  <div className="form-grid">
                    <label className="field" style={{ gridColumn: "span 2" }}>
                      {t.settings.telegramBot}
                      <input
                        type="password"
                        value={telegramBot}
                        placeholder={settings.hasTelegramBot ? t.settings.passwordStored : ""}
                        onChange={(e) => setTelegramBot(e.target.value)}
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

        <div className="dock" data-compact={foldableDock && dockCompact}>
          {view === "discover" ? (
            <>
              <div className="dock-fields">
                <div className="field">
                  {t.discover.geo}
                  <Select
                    multiple
                    value={countries}
                    onChange={setCountries}
                    summary={t.discover.chosen}
                    searchPlaceholder={t.discover.searchPlaceholder}
                    emptyLabel={t.discover.nothingFound}
                    options={[
                      { value: ALL, label: t.discover.all, exclusive: true },
                      ...[...COUNTRIES]
                        .sort((a, b) => a.name.localeCompare(b.name))
                        .map((c) => ({
                          value: c.code,
                          label: `${c.flag} ${c.name}`,
                          hint: c.code,
                        })),
                    ]}
                  />
                </div>
                <div className="field">
                  {t.discover.niche}
                  <Select
                    multiple
                    value={categories}
                    onChange={setCategories}
                    summary={t.discover.chosen}
                    searchPlaceholder={t.discover.searchPlaceholder}
                    emptyLabel={t.discover.nothingFound}
                    options={[
                      { value: ALL, label: t.discover.all, exclusive: true },
                      ...CATEGORIES.map((c) => ({ value: c, label: c })),
                    ]}
                  />
                </div>
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
                <button
                  className="btn btn-ghost"
                  onClick={() => {
                    setOnlySelected(true);
                    setView("discover");
                  }}
                >
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

          {view === "inbox" ? (
            <>
              <div className="dock-fields" style={{ gridTemplateColumns: "1fr" }}>
                <span className="dock-status">{t.inbox.count(visibleInbox.length)}</span>
              </div>
              <div className="dock-actions">
                <button className="btn" onClick={loadInbox} disabled={inboxLoading}>
                  {inboxLoading ? t.inbox.refreshing : t.inbox.refresh}
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
        {foldableDock ? (
          <div className="dock-mini" data-open={dockCompact} aria-hidden={!dockCompact}>
            {view === "settings" ? (
              <>
                <button
                  className="mini-button"
                  title={t.settings.test}
                  aria-label={t.settings.test}
                  onClick={testEmail}
                  disabled={testing}
                >
                  <svg viewBox="0 0 20 20" aria-hidden>
                    <path d="M3 6.5h14v9H3z" />
                    <path d="M3 7l7 5 7-5" />
                  </svg>
                </button>
                <button
                  className="mini-button mini-primary"
                  title={t.settings.save}
                  aria-label={t.settings.save}
                  onClick={saveSettings}
                  disabled={savingSettings}
                >
                  <svg viewBox="0 0 20 20" aria-hidden>
                    <path d="M4 10.5l4 4 8-9" />
                  </svg>
                </button>
              </>
            ) : (
              <>
                <button
                  className="mini-button"
                  title={t.discover.selectAll}
                  aria-label={t.discover.selectAll}
                  onClick={() => setSelectedIds(influencers.map((i) => i.id))}
                  disabled={influencers.length === 0}
                >
                  <svg viewBox="0 0 20 20" aria-hidden>
                    <path d="M2.5 10.5l3 3 6-6M8.5 13.5l3 3 6-6" />
                  </svg>
                  {selectedIds.length ? (
                    <span className="mini-count">{selectedIds.length}</span>
                  ) : null}
                </button>
                <button
                  className="mini-button mini-primary"
                  title={t.discover.parse}
                  aria-label={t.discover.parse}
                  onClick={search}
                  disabled={loading}
                >
                  <svg viewBox="0 0 20 20" aria-hidden>
                    <circle cx="9" cy="9" r="5.5" />
                    <path d="M13 13l4 4" />
                  </svg>
                </button>
              </>
            )}
          </div>
        ) : null}
      </main>

      {details ? (
        <ProfileModal
          influencer={details}
          selected={selectedIds.includes(details.id)}
          onToggle={() => toggle(details.id)}
          onClose={() => setDetails(null)}
          labels={t.discover}
        />
      ) : null}
    </div>
  );
}

function InfluencerCard({
  influencer,
  selected,
  onToggle,
  onInfo,
  labels,
}: {
  influencer: Influencer;
  selected: boolean;
  onToggle: () => void;
  onInfo: () => void;
  labels: { followers: string; engagement: string; nicheLabel: string; info: string };
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
        <div className="card-actions">
          <button
            className="info-button"
            title={labels.info}
            aria-label={labels.info}
            onClick={(event) => {
              event.stopPropagation();
              onInfo();
            }}
          >
            <svg viewBox="0 0 20 20" aria-hidden>
              <circle cx="10" cy="10" r="7.5" />
              <path d="M10 9v4.5" />
              <circle cx="10" cy="6.4" r="0.9" fill="currentColor" stroke="none" />
            </svg>
          </button>
          <span className="checkbox">✓</span>
        </div>
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
