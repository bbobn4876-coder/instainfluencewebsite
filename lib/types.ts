export type SocialLink = {
  platform: string;
  url: string;
};

export type Influencer = {
  id: string;
  username: string;
  fullName: string;
  biography: string;
  followers: number;
  engagementRate: number; // percent, from the medians below when available
  medianLikes?: number;
  medianComments?: number;
  medianReelViews?: number;
  country: string; // ISO-3166 alpha-2
  city?: string;
  category: string;
  avatarUrl?: string;
  profileUrl: string;
  emails: string[];
  phones: string[];
  links: SocialLink[];
  source: "mock" | "apify" | "instagram-graph";
};

export type SearchQuery = {
  /** One or more ISO-3166 alpha-2 codes. */
  countries: string[];
  categories?: string[];
  keyword?: string;
  minFollowers?: number;
  maxFollowers?: number;
  limit?: number;
};

export type OutreachChannel = "email" | "instagram" | "other";

export type OutreachResult = {
  influencerId: string;
  username: string;
  channel: OutreachChannel;
  target: string;
  status: "sent" | "drafted" | "skipped" | "failed";
  detail?: string;
};
