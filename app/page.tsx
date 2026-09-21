"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ALL, CATEGORIES, COUNTRIES, countryByCode } from "@/lib/countries";
import { dict, type Language } from "@/lib/i18n";
import { MAIL_PROVIDERS, guessProvider, providerById } from "@/lib/mailProviders";
import Select from "./Select";
import LogoLoader from "./LogoLoader";
import ProfileModal from "./ProfileModal";
import AuthModal, { type AuthMode } from "./AuthModal";
import Landing from "./Landing";
import GuideModal from "./GuideModal";
import TokenEditor from "./TokenEditor";
import { TOKENS } from "@/lib/tokens";
import { fileName } from "@/lib/exportTable";
import type { PublicSettings } from "@/lib/settings";
import type { InboxChannel, InboxMessage, ChannelStatus } from "@/lib/inbox";
import type { Influencer, OutreachResult } from "@/lib/types";

type View = "discover" | "compose" | "results" | "inbox" | "settings" | "admin";

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
    id: "admin",
    hotkey: "9",
    icon: (
      <svg viewBox="0 0 20 20" aria-hidden>
        <path d="M10 2.5l6 2.5v5c0 3.4-2.4 6.4-6 7.5-3.6-1.1-6-4.1-6-7.5v-5z" />
        <path d="M7.5 10l1.8 1.8L13 8" />
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

type AdminAccount = {
  id: string;
  email: string;
  createdAt: string;
  isAdmin: boolean;
  language: string;
  smtp: boolean;
  smtpFrom: string;
  imap: boolean;
  telegram: boolean;
  instagram: string;
};

type AdminData = {
  accounts: AdminAccount[];
  integrations: {
    apify: boolean;
    apifyActor: string;
    instagramGraph: boolean;
    authSecret: boolean;
    dataDir: string;
    node: string;
  };
};

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
  const [resultChannel, setResultChannel] = useState<"all" | "email" | "instagram" | "other">("all");
  const [resultStatus, setResultStatus] = useState<"all" | "sent" | "drafted" | "skipped" | "failed">("all");
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
  const [user, setUser] = useState<{ id: string; email: string; isAdmin?: boolean } | null>(null);
  const [guide, setGuide] = useState(false);
  const [admin, setAdmin] = useState<AdminData | null>(null);
  const [adminLoading, setAdminLoading] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);

  const [collapsed, setCollapsed] = useState(false);
  // The bottom bar folds into round icons while scrolling down through a page.
  const [dockCompact, setDockCompact] = useState(false);
  const [miniFilters, setMiniFilters] = useState(false);
  const [isNarrow, setIsNarrow] = useState(false);
  const [motion, setMotion] = useState(true);
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
    fetch("/api/auth")
      .then((r) => r.json())
      .then((data) => setUser(data.user ?? null))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!user) {
      setSettings(EMPTY_SETTINGS);
      return;
    }
    fetch("/api/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: PublicSettings | null) => {
        if (!data) return;
        setSettings(data);
        setLanguage(data.language);
        const known = MAIL_PROVIDERS.find(
          (p) => p.id !== "custom" && p.smtp.host === data.email.host,
        );
        if (known) setProviderId(known.id);
      })
      .catch(() => undefined);
  }, [user]);

  // Phone layout: the dock hides its fields and opens them as a panel instead.
  useEffect(() => {
    const query = window.matchMedia("(max-width: 900px)");
    const apply = () => setIsNarrow(query.matches);
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);

  const motionLoaded = useRef(false);

  useEffect(() => {
    try {
      setMotion(window.localStorage.getItem("motion") !== "off");
    } catch {
      /* storage can be blocked; animations stay on */
    }
    motionLoaded.current = true;
  }, []);

  useEffect(() => {
    document.documentElement.dataset.motion = motion ? "on" : "off";
    // Never write on the first pass: that would overwrite the stored value with
    // the default before it has been read back.
    if (!motionLoaded.current) return;
    try {
      window.localStorage.setItem("motion", motion ? "on" : "off");
    } catch {
      /* ignore */
    }
  }, [motion]);

  const signOut = useCallback(async () => {
    await fetch("/api/auth", { method: "DELETE" });
    setUser(null);
    setInfluencers([]);
    setSelectedIds([]);
    setResults([]);
    setInbox([]);
    setInboxLoaded(false);
    setSettings(EMPTY_SETTINGS);
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
    if (!user) {
      setAuthMode("signin");
      return;
    }
    setLoading(true);
    setNotice(null);

    const body = {
      countries,
      categories,
      keyword,
      minFollowers,
      maxFollowers,
      limit: 30,
    };

    const ask = async (extra: Record<string, unknown> = {}) => {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...body, ...extra }),
      });
      const text = await res.text();
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(text) as Record<string, unknown>;
      } catch {
        // A gateway timeout or crash answers with HTML, not JSON.
        throw new Error(`The server answered ${res.status}. ${text.slice(0, 120)}`);
      }
      if (!res.ok) throw new Error((data.error as string) ?? `The search failed (${res.status}).`);
      return data;
    };

    try {
      let data = await ask();

      // Profiles arrive in rounds, so results are accumulated as they land.
      const byId = new Map<string, Influencer>();
      const collect = (payload: Record<string, unknown>) => {
        for (const found of (payload.influencers as Influencer[]) ?? []) {
          if (!byId.has(found.id)) byId.set(found.id, found);
        }
      };

      setSelectedIds([]);
      setOnlySelected(false);

      // Apify keeps scraping after the request returns, so poll until it settles.
      const deadline = Date.now() + 3 * 60 * 60 * 1000;
      while (data.status === "running" && Date.now() < deadline) {
        collect(data);
        setInfluencers([...byId.values()]);
        const seenSoFar = Number(data.scanned ?? 0);
        setNotice(
          byId.size > 0
            ? t.discover.foundSoFar(byId.size, seenSoFar)
            : t.discover.stillRunning,
        );
        await new Promise((resolve) => setTimeout(resolve, 4000));
        data = await ask({
          runId: String(data.runId),
          datasetId: String(data.datasetId),
          stage: String(data.stage ?? "discover"),
          geo: data.geo,
          seen: data.seen,
          cursor: data.cursor,
          stats: data.stats,
        });
      }

      if (data.status === "running") {
        throw new Error(t.discover.tookTooLong);
      }

      collect(data);
      const found = [...byId.values()].sort((a, b) => b.followers - a.followers);
      setInfluencers(found);
      // Say how wide the net was, so a small result set is explainable.
      const stats = data.stats as
        | { posts: number; candidates: number; profiles: number; inBand: number }
        | undefined;
      setNotice(
        (data.notice as string) ??
          (stats
            ? t.discover.funnel(stats.posts, stats.candidates, stats.profiles, found.length)
            : null),
      );
      setView("discover");
    } catch (error) {
      setInfluencers([]);
      setNotice((error as Error).message);
    } finally {
      setLoading(false);
    }
  }, [user, countries, categories, keyword, minFollowers, maxFollowers, t]);

  const toggle = (id: string) =>
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const send = useCallback(async () => {
    if (!user) {
      setAuthMode("signin");
      return;
    }
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
  }, [user, selected, subject, body, channels]);

  const loadInbox = useCallback(async () => {
    if (!user) {
      setAuthMode("signin");
      return;
    }
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
  }, [user]);

  // Fetch on the first visit to the page; refreshing afterwards is manual.
  useEffect(() => {
    if (user && view === "inbox" && !inboxLoaded && !inboxLoading) void loadInbox();
  }, [user, view, inboxLoaded, inboxLoading, loadInbox]);

  const loadAdmin = useCallback(async () => {
    setAdminLoading(true);
    setNotice(null);
    try {
      const res = await fetch("/api/admin");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not load the panel.");
      setAdmin(data);
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      setAdminLoading(false);
    }
  }, []);

  useEffect(() => {
    if (view === "admin" && user?.isAdmin && !admin && !adminLoading) void loadAdmin();
  }, [view, user, admin, adminLoading, loadAdmin]);

  const removeAccount = useCallback(
    async (account: AdminAccount) => {
      if (!window.confirm(t.admin.removeConfirm(account.email))) return;
      const res = await fetch("/api/admin", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: account.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setNotice(data.error ?? "Could not delete the account.");
        return;
      }
      setNotice(t.admin.removed);
      setAdmin(null);
      void loadAdmin();
    },
    [t, loadAdmin],
  );

  const saveSettings = useCallback(async () => {
    if (!user) {
      setAuthMode("signin");
      return;
    }
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
  }, [user, language, settings, password, imapPassword, telegramBot, t]);

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
    if (!user) {
      setAuthMode("signin");
      return;
    }
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
  }, [user]);

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
    admin: admin?.accounts.length || undefined,
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

  const allSelected = influencers.length > 0 && selectedIds.length === influencers.length;

  const [downloading, setDownloading] = useState(false);

  const downloadTable = async () => {
    if (selected.length === 0 || downloading) return;
    setDownloading(true);
    try {
      // The workbook is built server-side so it can carry styling that a CSV cannot.
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ influencers: selected }),
      });
      if (!res.ok) throw new Error("export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName(selected.length);
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setNotice(t.discover.downloadFailed);
    } finally {
      setDownloading(false);
    }
  };

  const toggleSelectAll = () =>
    setSelectedIds(allSelected ? [] : influencers.map((i) => i.id));

  const visibleResults = results.filter(
    (r) =>
      (resultChannel === "all" || r.channel === resultChannel) &&
      (resultStatus === "all" || r.status === resultStatus),
  );

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
    setMiniFilters(false);
  }, [view]);

  useEffect(() => {
    if (!dockCompact && !isNarrow) setMiniFilters(false);
  }, [dockCompact, isNarrow]);

  const visibleInbox =
    inboxFilter === "all" ? inbox : inbox.filter((m) => m.channel === inboxFilter);

  const searchFields = (
    <>
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
    </>
  );

  // Signed-out visitors only ever see the landing page; the app shell, its
  // sidebar and its pages exist for accounts.
  if (!user) {
    return (
      <>
        <Landing
          language={language}
          onLanguage={setLanguage}
          onSignIn={() => setAuthMode("signin")}
          onSignUp={() => setAuthMode("signup")}
        />
        {authMode ? (
          <AuthModal
            mode={authMode}
            onMode={setAuthMode}
            onClose={() => setAuthMode(null)}
            onDone={(signedIn) => {
              setUser(signedIn);
              setAuthMode(null);
              setNotice(null);
              setView("discover");
            }}
            labels={{ ...t.auth, close: t.discover.close }}
          />
        ) : null}
      </>
    );
  }

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
          {VIEWS.filter((item) => item.id !== "admin" || user?.isAdmin).map((item) => (
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

        <div className="sidebar-auth">
          {user ? (
            <button
              className="nav-item"
              onClick={signOut}
              title={`${user.email} · ${t.auth.signOut}`}
            >
              <span className="nav-icon">
                <svg viewBox="0 0 20 20" aria-hidden>
                  <path d="M12.5 6.5V5a1.5 1.5 0 00-1.5-1.5H5A1.5 1.5 0 003.5 5v10A1.5 1.5 0 005 16.5h6a1.5 1.5 0 001.5-1.5v-1.5" />
                  <path d="M8 10h9M14.5 7l3 3-3 3" />
                </svg>
              </span>
              {collapsed ? null : (
                <span className="nav-label auth-email">{user.email}</span>
              )}
            </button>
          ) : (
            <button
              className="nav-item nav-signin"
              onClick={() => setAuthMode("signin")}
              title={`${t.auth.signIn} / ${t.auth.signUp}`}
            >
              <span className="nav-icon">
                <svg viewBox="0 0 20 20" aria-hidden>
                  <circle cx="10" cy="7" r="3.2" />
                  <path d="M4 16.5c0-2.8 2.7-4.5 6-4.5s6 1.7 6 4.5" />
                </svg>
              </span>
              {collapsed ? null : (
                <span className="nav-label">
                  {t.auth.signIn} / {t.auth.signUp}
                </span>
              )}
            </button>
          )}
        </div>
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
                <div className="empty">
                  {loading ? <LogoLoader label={t.discover.loading} /> : t.discover.empty}
                </div>
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
              {results.length > 0 ? (
                <div className="filter-rows">
                  <div className="toggles">
                    {(["all", "email", "instagram", "other"] as const).map((channel) => (
                      <button
                        key={channel}
                        className="toggle"
                        aria-pressed={resultChannel === channel}
                        onClick={() => setResultChannel(channel)}
                      >
                        {t.results[channel]}
                        <span className="toggle-count">
                          {channel === "all"
                            ? results.length
                            : results.filter((r) => r.channel === channel).length}
                        </span>
                      </button>
                    ))}
                  </div>
                  <div className="toggles">
                    {(["all", "sent", "drafted", "skipped", "failed"] as const).map((status) => (
                      <button
                        key={status}
                        className="toggle"
                        aria-pressed={resultStatus === status}
                        onClick={() => setResultStatus(status)}
                      >
                        {status === "all" ? t.results.all : t.results[status]}
                        <span className="toggle-count">
                          {status === "all"
                            ? results.length
                            : results.filter((r) => r.status === status).length}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {results.length === 0 ? (
                <div className="empty">{t.results.empty}</div>
              ) : visibleResults.length === 0 ? (
                <div className="empty">{t.results.nothingMatches}</div>
              ) : (
                <div className="rows">
                  {visibleResults.map((result, index) => (
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

          {view === "admin" && user?.isAdmin ? (
            <>
              <h1 className="view-title">{t.admin.title}</h1>
              <p className="view-sub">{t.admin.sub}</p>

              {admin ? (
                <div className="compose">
                  <section className="panel">
                    <h2 className="panel-title">{t.admin.serverTitle}</h2>
                    <div className="admin-grid">
                      <div className="admin-stat">
                        <span className="admin-stat-label">{t.admin.apify}</span>
                        <span className="status" data-status={admin.integrations.apify ? "sent" : "drafted"}>
                          {admin.integrations.apify ? t.admin.on : t.admin.off}
                        </span>
                      </div>
                      <div className="admin-stat">
                        <span className="admin-stat-label">{t.admin.apifyActor}</span>
                        <span className="admin-stat-value">{admin.integrations.apifyActor}</span>
                      </div>
                      <div className="admin-stat">
                        <span className="admin-stat-label">{t.admin.instagramGraph}</span>
                        <span
                          className="status"
                          data-status={admin.integrations.instagramGraph ? "sent" : "drafted"}
                        >
                          {admin.integrations.instagramGraph ? t.admin.on : t.admin.off}
                        </span>
                      </div>
                      <div className="admin-stat">
                        <span className="admin-stat-label">{t.admin.authSecret}</span>
                        <span
                          className="status"
                          data-status={admin.integrations.authSecret ? "sent" : "drafted"}
                        >
                          {admin.integrations.authSecret ? t.admin.on : t.admin.off}
                        </span>
                      </div>
                      <div className="admin-stat">
                        <span className="admin-stat-label">{t.admin.dataDir}</span>
                        <span className="admin-stat-value">{admin.integrations.dataDir}</span>
                      </div>
                      <div className="admin-stat">
                        <span className="admin-stat-label">{t.admin.node}</span>
                        <span className="admin-stat-value">{admin.integrations.node}</span>
                      </div>
                    </div>
                  </section>

                  <section className="panel">
                    <h2 className="panel-title">{t.admin.accountsTitle(admin.accounts.length)}</h2>
                    {admin.accounts.length === 0 ? (
                      <p className="hint">{t.admin.empty}</p>
                    ) : (
                      <div className="admin-users">
                        {admin.accounts.map((account) => (
                          <article className="admin-user" key={account.id}>
                            <div>
                              <div className="admin-user-email">
                                {account.email}
                                {account.isAdmin ? (
                                  <span className="admin-badge"> {t.admin.adminBadge}</span>
                                ) : null}
                              </div>
                              <div className="admin-user-meta">
                                {t.admin.created}:{" "}
                                {new Date(account.createdAt).toLocaleDateString(
                                  language === "ru" ? "ru-RU" : "en-GB",
                                )}
                                {account.smtpFrom ? ` · ${account.smtpFrom}` : ""}
                                {account.instagram ? ` · ${account.instagram}` : ""}
                              </div>
                            </div>

                            <div className="admin-actions">
                              <div className="chips">
                                {(
                                  [
                                    [t.admin.mail, account.smtp],
                                    [t.admin.imap, account.imap],
                                    [t.admin.telegram, account.telegram],
                                  ] as [string, boolean][]
                                ).map(([label, on]) => (
                                  <span
                                    key={label}
                                    className="chip status-chip"
                                    data-on={on}
                                    title={on ? t.admin.connected : t.admin.notConnected}
                                  >
                                    <i className="status-dot" aria-hidden />
                                    {label}
                                  </span>
                                ))}
                              </div>
                              {account.isAdmin ? null : (
                                <button
                                  className="btn btn-danger btn-sm"
                                  onClick={() => removeAccount(account)}
                                >
                                  {t.admin.remove}
                                </button>
                              )}
                            </div>
                          </article>
                        ))}
                      </div>
                    )}
                  </section>
                </div>
              ) : (
                <div className="empty">{adminLoading ? "…" : t.admin.refresh}</div>
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
                  <h2 className="panel-title">{t.settings.motion}</h2>
                  <p className="hint">{t.settings.motionHint}</p>
                  <div className="toggles">
                    <button className="toggle" aria-pressed={motion} onClick={() => setMotion(true)}>
                      {t.settings.motionOn}
                    </button>
                    <button
                      className="toggle"
                      aria-pressed={!motion}
                      onClick={() => setMotion(false)}
                    >
                      {t.settings.motionOff}
                    </button>
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
              <div className="dock-fields dock-search">{searchFields}
              </div>
              <div className="dock-actions">
                <span className="dock-status">{t.discover.selectedCount(selectedIds.length)}</span>
                <button
                  className="icon-button"
                  data-visible={selectedIds.length > 0}
                  aria-hidden={selectedIds.length === 0}
                  tabIndex={selectedIds.length > 0 ? 0 : -1}
                  title={t.discover.download}
                  aria-label={t.discover.download}
                  onClick={downloadTable}
                >
                  <svg viewBox="0 0 20 20" aria-hidden>
                    <path d="M10 3.5v9M6.5 9.5l3.5 3.5 3.5-3.5" />
                    <path d="M4 16h12" />
                  </svg>
                </button>
                <button
                  className="btn btn-ghost only-mobile"
                  aria-expanded={miniFilters}
                  onClick={() => setMiniFilters((prev) => !prev)}
                >
                  {t.discover.filters}
                </button>
                <button
                  className="btn btn-ghost"
                  onClick={toggleSelectAll}
                  disabled={influencers.length === 0}
                >
                  {allSelected ? t.discover.deselectAll : t.discover.selectAll}
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
                <button className="btn btn-ghost" onClick={() => setGuide(true)}>
                  {t.settings.help}
                </button>
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

          {view === "admin" ? (
            <>
              <div className="dock-fields" style={{ gridTemplateColumns: "1fr" }}>
                <span className="dock-status">
                  {t.admin.accountsTitle(admin?.accounts.length ?? 0)}
                </span>
              </div>
              <div className="dock-actions">
                <button
                  className="btn"
                  onClick={() => {
                    setAdmin(null);
                    void loadAdmin();
                  }}
                  disabled={adminLoading}
                >
                  {t.admin.refresh}
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
        {foldableDock && view === "discover" ? (
          <div className="mini-panel" data-open={miniFilters && (dockCompact || isNarrow)}>
            {searchFields}
          </div>
        ) : null}

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
                  title={t.discover.filters}
                  aria-label={t.discover.filters}
                  aria-expanded={miniFilters}
                  onClick={() => setMiniFilters((prev) => !prev)}
                >
                  <svg viewBox="0 0 20 20" aria-hidden>
                    <path d="M3 5.5h14M6 10h8M8.5 14.5h3" />
                  </svg>
                </button>
                <button
                  className="mini-button mini-fade"
                  data-visible={selectedIds.length > 0}
                  aria-hidden={selectedIds.length === 0}
                  tabIndex={selectedIds.length > 0 ? 0 : -1}
                  title={t.discover.download}
                  aria-label={t.discover.download}
                  onClick={downloadTable}
                >
                  <svg viewBox="0 0 20 20" aria-hidden>
                    <path d="M10 3.5v9M6.5 9.5l3.5 3.5 3.5-3.5" />
                    <path d="M4 16h12" />
                  </svg>
                </button>
                <button
                  className="mini-button"
                  title={allSelected ? t.discover.deselectAll : t.discover.selectAll}
                  aria-label={allSelected ? t.discover.deselectAll : t.discover.selectAll}
                  onClick={toggleSelectAll}
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

      {authMode ? (
        <AuthModal
          mode={authMode}
          onMode={setAuthMode}
          onClose={() => setAuthMode(null)}
          onDone={(signedIn) => {
            setUser(signedIn);
            setAuthMode(null);
            setNotice(null);
            setView("discover");
          }}
          labels={{ ...t.auth, close: t.discover.close }}
        />
      ) : null}

      {guide ? (
        <GuideModal
          title={t.guide.title}
          intro={t.guide.intro}
          steps={t.guide.steps}
          note={t.guide.note}
          closeLabel={t.guide.close}
          onClose={() => setGuide(false)}
        />
      ) : null}

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
  const country = countryByCode(influencer.country);
  // Where the profile is from, which the cards never said before.
  const place = [influencer.city, country ? `${country.flag} ${country.name}` : influencer.country]
    .filter(Boolean)
    .join(", ");

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
            {place ? ` · ${place}` : ""}
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
