"use client";

/**
 * The one block that invites someone to subscribe. It carries the same
 * drifting gradient and noise as the configurator, so the landing page, the
 * in-app gate and the Settings panel all lead there looking like one thing.
 */
export default function SubscribeCallout({
  title,
  body,
  action,
  onAction,
  compact,
}: {
  title: string;
  body?: string;
  action: string;
  /** Without a handler the block is a link straight to the configurator. */
  onAction?: () => void;
  compact?: boolean;
}) {
  return (
    <div className="callout" data-compact={compact}>
      <div className="subscribe-glow" aria-hidden />
      <div className="subscribe-noise" aria-hidden />

      <div className="callout-inner">
        <h2 className="callout-title">{title}</h2>
        {body ? <p className="callout-body">{body}</p> : null}
        {onAction ? (
          <button className="btn callout-action" onClick={onAction}>
            {action}
          </button>
        ) : (
          <a className="btn callout-action" href="/subscribe">
            {action}
          </a>
        )}
      </div>
    </div>
  );
}
