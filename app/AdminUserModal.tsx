"use client";

import { VOLUMES, VOLUME_ORDER, type SubscriptionConfig, type VolumeId } from "@/lib/plans";

export type AdminStats = {
  profiles: number;
  requests: number;
  outreach: number;
  searches: number;
};

type Copy = {
  statProfiles: string;
  statSearches: string;
  statOutreach: string;
  statRequests: string;
  statSpend: string;
  statToday: string;
  statJoined: string;
  statSince: string;
  grant: string;
  grantNone: string;
  close: string;
};

/** Everything the admin panel knows about one account, plus the plan control. */
export default function AdminUserModal({
  email,
  createdAt,
  startedAt,
  config,
  totals,
  spend,
  usedToday,
  copy,
  volumeNames,
  busy,
  onGrant,
  onClose,
}: {
  email: string;
  createdAt: string;
  startedAt?: string | null;
  config: SubscriptionConfig | null;
  totals: AdminStats;
  spend: number;
  usedToday: number;
  copy: Copy;
  volumeNames: Record<VolumeId, string>;
  busy: boolean;
  onGrant: (config: SubscriptionConfig | null) => void;
  onClose: () => void;
}) {
  const date = (value?: string | null) =>
    value ? new Date(value).toLocaleDateString("en-GB") : "—";

  const rows: [string, string][] = [
    [copy.statProfiles, totals.profiles.toLocaleString("en-US")],
    [copy.statToday, usedToday.toLocaleString("en-US")],
    [copy.statSearches, totals.searches.toLocaleString("en-US")],
    [copy.statOutreach, totals.outreach.toLocaleString("en-US")],
    [copy.statRequests, totals.requests.toLocaleString("en-US")],
    [copy.statSpend, `$${spend.toFixed(2)}`],
    [copy.statJoined, date(createdAt)],
    [copy.statSince, date(startedAt)],
  ];

  return (
    <div className="modal-backdrop" role="dialog" aria-modal onClick={onClose}>
      <div className="modal admin-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="modal-close" onClick={onClose} aria-label={copy.close}>
          <svg viewBox="0 0 20 20" aria-hidden>
            <path d="M6 6l8 8M14 6l-8 8" />
          </svg>
        </button>

        <h2 className="panel-title">{email}</h2>

        <dl className="admin-stats">
          {rows.map(([label, value]) => (
            <div className="admin-stat-row" key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>

        <div className="admin-grant">
          <span className="admin-stat-label">{copy.grant}</span>
          <div className="toggles">
            <button
              className="toggle"
              aria-pressed={!config}
              disabled={busy}
              onClick={() => onGrant(null)}
            >
              {copy.grantNone}
            </button>
            {VOLUME_ORDER.map((id) => (
              <button
                className="toggle"
                key={id}
                aria-pressed={config?.volume === id}
                disabled={busy}
                onClick={() =>
                  onGrant({
                    volume: id,
                    senders: config?.senders ?? 1,
                    depth: config?.depth ?? "standard",
                    prioritySupport: config?.prioritySupport ?? false,
                  })
                }
              >
                {volumeNames[id]}
                <span className="toggle-count">
                  {VOLUMES[id].dailyProfiles.toLocaleString("en-US")}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
