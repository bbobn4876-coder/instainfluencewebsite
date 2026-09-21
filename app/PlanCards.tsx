"use client";

import { PLANS, PLAN_ORDER, type PlanId } from "@/lib/plans";

type Copy = {
  perMonth: string;
  planNames: Record<PlanId, string>;
  planTag: Record<PlanId, string>;
  planFeature: {
    profiles: (n: number) => string;
    senders: (n: number) => string;
    support: string;
    everything: string;
    contacts: string;
    tables: string;
    inbox: string;
  };
  choosePlan: string;
  currentPlan: string;
};

/** What each plan lists, built from the same limits the server enforces. */
function features(id: PlanId, copy: Copy): string[] {
  const plan = PLANS[id];
  const lines = [copy.planFeature.profiles(plan.dailyProfiles), copy.planFeature.senders(plan.senders)];
  if (id === "standard") {
    lines.push(copy.planFeature.contacts, copy.planFeature.tables, copy.planFeature.inbox);
  } else {
    lines.unshift(copy.planFeature.everything);
  }
  if (plan.prioritySupport) lines.push(copy.planFeature.support);
  return lines;
}

export default function PlanCards({
  copy,
  current,
  onChoose,
  busy,
}: {
  copy: Copy;
  current?: PlanId | null;
  onChoose: (plan: PlanId) => void;
  busy?: boolean;
}) {
  return (
    <div className="plan-grid">
      {PLAN_ORDER.map((id) => {
        const plan = PLANS[id];
        const active = current === id;
        return (
          <article className="plan-card" key={id} data-featured={id === "pro"} data-active={active}>
            <span className="plan-tag">{copy.planTag[id]}</span>
            <h3 className="plan-name">{copy.planNames[id]}</h3>
            <p className="plan-price">
              <span>${plan.price}</span>
              <small>{copy.perMonth}</small>
            </p>
            <ul className="plan-features">
              {features(id, copy).map((line) => (
                <li key={line}>
                  <i className="plan-dot" aria-hidden />
                  {line}
                </li>
              ))}
            </ul>
            <button
              className={id === "pro" ? "btn" : "btn btn-ghost"}
              onClick={() => onChoose(id)}
              disabled={busy || active}
            >
              {active ? copy.currentPlan : copy.choosePlan}
            </button>
          </article>
        );
      })}
    </div>
  );
}
