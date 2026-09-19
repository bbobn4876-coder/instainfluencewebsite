"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CATEGORIES, COUNTRIES } from "@/lib/countries";
import type { Influencer, OutreachResult } from "@/lib/types";

type View = "discover" | "selected" | "compose" | "results";

const VIEWS: Array<{ id: View; label: string }> = [
  { id: "discover", label: "Discover" },
  { id: "selected", label: "Selected" },
  { id: "compose", label: "Compose" },
  { id: "results", label: "Results" },
];

const DEFAULT_BODY = `Hi {{name}},

I've been following @{{username}} and love how your {{category}} work lands with your {{followers}} followers in {{city}}.

We're planning a paid collaboration this quarter and would like you in it. Happy to send the brief and rates — just let me know if you're open.

Best,
`;

function formatFollowers(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1000)}K`;
  return String(n);
}

export default function Page() {
  const [view, setView] = useState<View>("discover");

  const [country, setCountry] = useState("US");
  const [category, setCategory] = useState("fashion");
  const [keyword, setKeyword] = useState("");
  const [minFollowers, setMinFollowers] = useState(10_000);
  const [maxFollowers, setMaxFollowers] = useState(500_000);

  const [influencers, setInfluencers] = useState<Influencer[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [provider, setProvider] = useState<string | null>(null);

  const [subject, setSubject] = useState("Paid collaboration with {{name}}");
  const [body, setBody] = useState(DEFAULT_BODY);
  const [channels, setChannels] = useState({ email: true, instagram: true, other: false });
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState<OutreachResult[]>([]);
  const [emailConfigured, setEmailConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/outreach")
      .then((r) => r.json())
      .then((d) => setEmailConfigured(Boolean(d.emailConfigured)))
      .catch(() => setEmailConfigured(false));
  }, []);

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
      setProvider(data.provider ?? null);
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
      setEmailConfigured(Boolean(data.emailConfigured));
      setView("results");
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      setSending(false);
    }
  }, [selected, subject, body, channels]);

  const counts: Record<View, number | undefined> = {
    discover: influencers.length || undefined,
    selected: selectedIds.length || undefined,
    compose: undefined,
    results: results.length || undefined,
  };

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-dot" />
          InstaInfluence
        </div>
        <nav className="nav">
          {VIEWS.map((item) => (
            <button
              key={item.id}
              className="nav-item"
              aria-current={view === item.id}
              onClick={() => setView(item.id)}
            >
              {item.label}
              {counts[item.id] ? <span className="nav-count">{counts[item.id]}</span> : null}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          Source: {provider ?? "—"}
          <br />
          Email: {emailConfigured === null ? "…" : emailConfigured ? "SMTP ready" : "draft mode"}
        </div>
      </aside>

      <main className="main">
        <div className="content">
          {notice ? <div className="notice">{notice}</div> : null}

          {view === "discover" ? (
            <>
              <h1 className="view-title">Discover</h1>
              <p className="view-sub">
                Pick a geo below and pull public Instagram profiles with the contacts stated in
                their bio — email, phone and links to their other networks. Click a card to select
                it for outreach.
              </p>
              {influencers.length === 0 ? (
                <div className="empty">
                  {loading ? "Parsing profiles…" : "Set your filters in the bar below and run a search."}
                </div>
              ) : (
                <div className="grid">
                  {influencers.map((influencer) => (
                    <InfluencerCard
                      key={influencer.id}
                      influencer={influencer}
                      selected={selectedIds.includes(influencer.id)}
                      onToggle={() => toggle(influencer.id)}
                    />
                  ))}
                </div>
              )}
            </>
          ) : null}

          {view === "selected" ? (
            <>
              <h1 className="view-title">Selected</h1>
              <p className="view-sub">{selected.length} profile(s) queued for outreach.</p>
              {selected.length === 0 ? (
                <div className="empty">Nothing selected yet — pick profiles in Discover.</div>
              ) : (
                <div className="grid">
                  {selected.map((influencer) => (
                    <InfluencerCard
                      key={influencer.id}
                      influencer={influencer}
                      selected
                      onToggle={() => toggle(influencer.id)}
                    />
                  ))}
                </div>
              )}
            </>
          ) : null}

          {view === "compose" ? (
            <>
              <h1 className="view-title">Compose</h1>
              <p className="view-sub">
                Placeholders: {"{{name}}"}, {"{{username}}"}, {"{{followers}}"}, {"{{category}}"},{" "}
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
                      {channel === "other" ? "other socials" : channel}
                    </button>
                  ))}
                </div>
                <label className="field">
                  subject
                  <input value={subject} onChange={(e) => setSubject(e.target.value)} />
                </label>
                <label className="field">
                  message
                  <textarea rows={12} value={body} onChange={(e) => setBody(e.target.value)} />
                </label>
                <p className="hint">
                  Emails go out over your SMTP account when it is configured. Instagram and other
                  networks have no compliant API for cold messages, so those are prepared as ready
                  drafts with a direct link to the conversation — you send them with one click from
                  Results.
                </p>
              </div>
            </>
          ) : null}

          {view === "results" ? (
            <>
              <h1 className="view-title">Results</h1>
              <p className="view-sub">
                {results.filter((r) => r.status === "sent").length} sent ·{" "}
                {results.filter((r) => r.status === "drafted").length} drafted ·{" "}
                {results.filter((r) => r.status === "skipped").length} skipped ·{" "}
                {results.filter((r) => r.status === "failed").length} failed
              </p>
              {results.length === 0 ? (
                <div className="empty">No outreach run yet.</div>
              ) : (
                <div className="rows">
                  {results.map((result, index) => (
                    <div className="row" key={`${result.influencerId}-${result.channel}-${index}`}>
                      <span>@{result.username}</span>
                      <span className="muted">{result.channel}</span>
                      {result.target.startsWith("http") ? (
                        <a className="chip" href={result.target} target="_blank" rel="noreferrer">
                          open
                        </a>
                      ) : (
                        <span className="muted" title={result.detail}>
                          {result.target}
                        </span>
                      )}
                      <span className="status" data-status={result.status}>
                        {result.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : null}
        </div>

        <div className="dock">
          {view === "discover" || view === "selected" ? (
            <>
              <div className="dock-fields">
                <label className="field">
                  geo
                  <select value={country} onChange={(e) => setCountry(e.target.value)}>
                    {COUNTRIES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.flag} {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  niche
                  <select value={category} onChange={(e) => setCategory(e.target.value)}>
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  keyword
                  <input
                    value={keyword}
                    placeholder="handle or bio text"
                    onChange={(e) => setKeyword(e.target.value)}
                  />
                </label>
                <label className="field">
                  min followers
                  <input
                    type="number"
                    min={0}
                    step={1000}
                    value={minFollowers}
                    onChange={(e) => setMinFollowers(Number(e.target.value))}
                  />
                </label>
                <label className="field">
                  max followers
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
                <span className="dock-status">{selectedIds.length} selected</span>
                <button
                  className="btn btn-ghost"
                  onClick={() => setSelectedIds(influencers.map((i) => i.id))}
                  disabled={influencers.length === 0}
                >
                  Select all
                </button>
                <button className="btn" onClick={search} disabled={loading}>
                  {loading ? "Parsing…" : "Parse profiles"}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="dock-fields" style={{ gridTemplateColumns: "1fr" }}>
                <span className="dock-status">
                  {selected.length} recipient(s) ·{" "}
                  {Object.entries(channels)
                    .filter(([, on]) => on)
                    .map(([name]) => name)
                    .join(", ") || "no channel"}
                </span>
              </div>
              <div className="dock-actions">
                <button className="btn btn-ghost" onClick={() => setView("selected")}>
                  Back to selection
                </button>
                <button className="btn" onClick={send} disabled={sending || selected.length === 0}>
                  {sending ? "Sending…" : "Send outreach"}
                </button>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function InfluencerCard({
  influencer,
  selected,
  onToggle,
}: {
  influencer: Influencer;
  selected: boolean;
  onToggle: () => void;
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
          <div className="stat-label">followers</div>
        </div>
        {influencer.engagementRate > 0 ? (
          <div>
            <div className="stat-value">{influencer.engagementRate}%</div>
            <div className="stat-label">engagement</div>
          </div>
        ) : null}
        <div>
          <div className="stat-value">{influencer.category}</div>
          <div className="stat-label">niche</div>
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
