/**
 * Holds what the app already learned about the session, for the lifetime of
 * the JavaScript context. Client-side navigation keeps that context, so coming
 * back from another route can render straight away instead of waiting on the
 * same two requests again. A real page load starts with it empty.
 */
import type { SubscriptionConfig } from "@/lib/plans";

export type CachedUser = { id: string; email: string; isAdmin?: boolean } | null;

export type CachedSubscription = {
  config: SubscriptionConfig | null;
  usedToday: number;
  unlimited: boolean;
  limits: { dailyProfiles: number; senders: number } | null;
} | null;

let user: CachedUser;
let userKnown = false;
let subscription: CachedSubscription = null;

export const session = {
  get user(): CachedUser {
    return user ?? null;
  },
  get known(): boolean {
    return userKnown;
  },
  get subscription(): CachedSubscription {
    return subscription;
  },
  setUser(value: CachedUser) {
    user = value;
    userKnown = true;
  },
  setSubscription(value: CachedSubscription) {
    subscription = value;
  },
  /** Signing out must not leave the next render with stale answers. */
  clear() {
    user = null;
    userKnown = false;
    subscription = null;
  },
};
