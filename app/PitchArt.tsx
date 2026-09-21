"use client";

type ArtCopy = {
  followers: string;
  engagement: string;
  stale: string;
  sheetTitle: string;
  sheetNote: string;
  letterTitle: string;
  letterNote: string;
  totalLabel: string;
  perMonth: string;
};

const CREATORS = [
  { handle: "@k.jadereason", place: "Los Angeles", followers: "4.2K", er: "3.3%", mail: "jade@…" },
  { handle: "@anna.hleigh_", place: "Miami", followers: "6.1K", er: "7.0%", mail: "anna@…" },
];

/** Discover's own cards, shrunk: the slide shows the thing it describes. */
function FoundCreators({ copy }: { copy: ArtCopy }) {
  return (
    <div className="art-stack">
      {CREATORS.map((creator) => (
        <article className="art-card" key={creator.handle}>
          <div className="art-card-head">
            <span className="art-avatar" aria-hidden />
            <div>
              <b>{creator.handle}</b>
              <small>{creator.place}</small>
            </div>
          </div>
          <div className="art-stats">
            <div>
              <b>{creator.followers}</b>
              <small>{copy.followers}</small>
            </div>
            <div>
              <b>{creator.er}</b>
              <small>{copy.engagement}</small>
            </div>
          </div>
          <div className="art-chips">
            <span className="art-chip art-chip-mail">{creator.mail}</span>
            <span className="art-chip">instagram</span>
          </div>
        </article>
      ))}
    </div>
  );
}

/** The hand-built sheet that is already going stale. */
function StaleSheet({ copy }: { copy: ArtCopy }) {
  return (
    <div className="art-sheet">
      <div className="art-sheet-bar">
        <span>{copy.sheetTitle}</span>
      </div>
      {[0, 1, 2, 3, 4, 5].map((row) => (
        <div className="art-row" key={row} data-stale={row === 1 || row === 4}>
          <span className="art-cell art-cell-wide" />
          <span className="art-cell" />
          <span className="art-cell art-cell-thin" />
          {(row === 1 || row === 4) && <em className="art-stale">{copy.stale}</em>}
        </div>
      ))}
      <p className="art-note">{copy.sheetNote}</p>
    </div>
  );
}

/** One letter fanning out to many, each personalised. */
function OneToMany({ copy }: { copy: ArtCopy }) {
  return (
    <div className="art-fan">
      {/* The stack is its own box: the sheets behind stretch over the letter
          only, not over the caption underneath it. */}
      <div className="art-fan-stack">
        <div className="art-letter art-letter-back" aria-hidden />
        <div className="art-letter art-letter-mid" aria-hidden />
        <div className="art-letter art-letter-front">
          <b>{copy.letterTitle}</b>
          <span className="art-line" />
          <span className="art-line art-line-short" />
          <span className="art-token">Name</span>
          <span className="art-line" />
          <span className="art-line art-line-short" />
        </div>
      </div>
      <p className="art-note">{copy.letterNote}</p>
    </div>
  );
}

/** The configurator's receipt, as a promise of what comes next. */
function PlanReceipt({ copy }: { copy: ArtCopy }) {
  const lines = [
    ["Growth", "$44"],
    ["3 mailboxes", "$12"],
    ["Deep search", "$29"],
  ];
  return (
    <div className="art-receipt">
      {lines.map(([label, amount]) => (
        <div className="art-receipt-line" key={label}>
          <span>{label}</span>
          <b>{amount}</b>
        </div>
      ))}
      <div className="art-receipt-total">
        <span>{copy.totalLabel}</span>
        <p>
          <b>$85</b>
          <small>{copy.perMonth}</small>
        </p>
      </div>
    </div>
  );
}

export default function PitchArt({ step, copy }: { step: number; copy: ArtCopy }) {
  if (step === 1) return <StaleSheet copy={copy} />;
  if (step === 2) return <OneToMany copy={copy} />;
  if (step === 3) return <PlanReceipt copy={copy} />;
  return <FoundCreators copy={copy} />;
}
