import { countryByCode } from "./countries";
import type { Influencer } from "./types";

const COLUMNS = [
  "Creator",
  "IG handle",
  "Profile URL",
  "Geo",
  "Followers",
  "Median likes",
  "Median comments",
  "ER % (median)",
  "Median reel views",
  "Price",
] as const;

function cell(value: string | number | undefined): string {
  if (value === undefined || value === null || value === "") return "";
  const text = String(value);
  // Quote whenever the text could break the row apart.
  return /[",;\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function geo(influencer: Influencer): string {
  const country = countryByCode(influencer.country);
  const name = country?.name ?? influencer.country;
  return influencer.city ? `${influencer.city}, ${name}` : name;
}

export function toCsv(influencers: Influencer[]): string {
  const rows = influencers.map((influencer) =>
    [
      cell(influencer.fullName || influencer.username),
      cell(`@${influencer.username}`),
      cell(influencer.profileUrl),
      cell(geo(influencer)),
      cell(influencer.followers || ""),
      cell(influencer.medianLikes),
      cell(influencer.medianComments),
      cell(influencer.engagementRate ? influencer.engagementRate.toFixed(2) : ""),
      cell(influencer.medianReelViews),
      // Price is filled in by hand after export.
      "",
    ].join(","),
  );
  return [COLUMNS.join(","), ...rows].join("\r\n");
}

export function csvFileName(count: number): string {
  const day = new Date().toISOString().slice(0, 10);
  return `loomera-${count}-creators-${day}.csv`;
}
