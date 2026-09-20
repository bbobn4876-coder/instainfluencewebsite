"use client";

import { useEffect } from "react";
import type { Influencer } from "@/lib/types";

type Labels = {
  close: string;
  contacts: string;
  links: string;
  bio: string;
  location: string;
  source: string;
  noContacts: string;
  openProfile: string;
  followers: string;
  engagement: string;
  nicheLabel: string;
  select: string;
  deselect: string;
};

function initials(name: string, username: string): string {
  const source = name.trim() || username;
  const parts = source.split(/[\s._-]+/).filter(Boolean);
  return (parts[0]?.[0] ?? "?").concat(parts[1]?.[0] ?? "").toUpperCase();
}

export default function ProfileModal({
  influencer,
  selected,
  onToggle,
  onClose,
  labels,
}: {
  influencer: Influencer;
  selected: boolean;
  onToggle: () => void;
  onClose: () => void;
  labels: Labels;
}) {
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

  const otherLinks = influencer.links.filter((l) => l.platform !== "instagram");

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={influencer.username}
        onClick={(event) => event.stopPropagation()}
      >
        <button className="modal-close" onClick={onClose} aria-label={labels.close}>
          <svg viewBox="0 0 20 20" aria-hidden>
            <path d="M5 5l10 10M15 5L5 15" />
          </svg>
        </button>

        <header className="modal-head">
          {influencer.avatarUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img className="avatar" src={influencer.avatarUrl} alt="" />
          ) : (
            <div className="avatar avatar-fallback">
              {initials(influencer.fullName, influencer.username)}
            </div>
          )}
          <div className="modal-id">
            <h2 className="modal-title">{influencer.fullName || influencer.username}</h2>
            <a
              className="modal-handle"
              href={influencer.profileUrl}
              target="_blank"
              rel="noreferrer"
            >
              @{influencer.username}
            </a>
          </div>
        </header>

        <div className="modal-stats">
          <div>
            <div className="modal-stat-value">{influencer.followers.toLocaleString("en-US")}</div>
            <div className="stat-label">{labels.followers}</div>
          </div>
          {influencer.engagementRate > 0 ? (
            <div>
              <div className="modal-stat-value">{influencer.engagementRate}%</div>
              <div className="stat-label">{labels.engagement}</div>
            </div>
          ) : null}
          <div>
            <div className="modal-stat-value">{influencer.category}</div>
            <div className="stat-label">{labels.nicheLabel}</div>
          </div>
          <div>
            <div className="modal-stat-value">
              {[influencer.city, influencer.country].filter(Boolean).join(", ")}
            </div>
            <div className="stat-label">{labels.location}</div>
          </div>
        </div>

        {influencer.biography ? (
          <section className="modal-section">
            <h3 className="modal-section-title">{labels.bio}</h3>
            <p className="modal-bio">{influencer.biography}</p>
          </section>
        ) : null}

        <section className="modal-section">
          <h3 className="modal-section-title">{labels.contacts}</h3>
          {influencer.emails.length === 0 && influencer.phones.length === 0 ? (
            <p className="modal-muted">{labels.noContacts}</p>
          ) : (
            <div className="chips">
              {influencer.emails.map((email) => (
                <a key={email} className="chip chip-mail" href={`mailto:${email}`}>
                  {email}
                </a>
              ))}
              {influencer.phones.map((phone) => (
                <a key={phone} className="chip" href={`tel:${phone}`}>
                  {phone}
                </a>
              ))}
            </div>
          )}
        </section>

        {otherLinks.length > 0 ? (
          <section className="modal-section">
            <h3 className="modal-section-title">{labels.links}</h3>
            <div className="chips">
              {otherLinks.map((link) => (
                <a key={link.url} className="chip" href={link.url} target="_blank" rel="noreferrer">
                  {link.platform} · {link.url.replace(/^https?:\/\//, "")}
                </a>
              ))}
            </div>
          </section>
        ) : null}

        <footer className="modal-foot">
          <span className="modal-source">
            {labels.source}: {influencer.source}
          </span>
          <a className="btn btn-ghost" href={influencer.profileUrl} target="_blank" rel="noreferrer">
            {labels.openProfile}
          </a>
          <button className="btn" onClick={onToggle}>
            {selected ? labels.deselect : labels.select}
          </button>
        </footer>
      </div>
    </div>
  );
}
