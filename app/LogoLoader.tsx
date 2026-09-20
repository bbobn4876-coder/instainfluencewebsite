"use client";

/**
 * The Loomera mark as two bars that trade sizes: the wide one narrows while
 * the slim one grows, then back. Used instead of a "parsing…" line.
 */
export default function LogoLoader({ label }: { label?: string }) {
  return (
    <div className="logo-loader" role="status" aria-label={label ?? "Loading"}>
      <div className="logo-loader-mark" aria-hidden>
        <span className="logo-bar logo-bar-wide" />
        <span className="logo-bar logo-bar-slim" />
      </div>
    </div>
  );
}
