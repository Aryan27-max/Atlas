"use client";

import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from "react";

import { DEMO_STUDENTS, placeStudents, type Group } from "./demo-buckets";
import styles from "./CutoffDemo.module.css";

const AXIS_MIN = 20;
const AXIS_MAX = 100;
const DEFAULTS = { shortlist: 75, band: 60, minimum: 0 };
const GROUPS: { id: Group; label: string }[] = [
  { id: "shortlisted", label: "Shortlisted" },
  { id: "cutoff", label: "Cutoff" },
  { id: "rejected", label: "Rejected" },
];

type Dot = { id: number; cx: number; cy: number };

/** Stacks the dots in columns: each one sits on the lowest free row at its score. */
function layout(width: number) {
  const r = width < 520 ? 6 : width < 820 ? 7.5 : 9;
  const step = 2 * r + 2;
  const pad = r + 4;
  const x = (score: number) => pad + ((score - AXIS_MIN) / (AXIS_MAX - AXIS_MIN)) * (width - 2 * pad);

  const rows: number[][] = [];
  const placed: { id: number; cx: number; row: number }[] = [];
  const ordered = [...DEMO_STUDENTS].sort((a, b) => b.score - a.score || a.id - b.id);
  for (const s of ordered) {
    const cx = x(s.score);
    let row = 0;
    while ((rows[row] ?? []).some((other) => Math.abs(other - cx) < step)) row += 1;
    (rows[row] ??= []).push(cx);
    placed.push({ id: s.id, cx, row });
  }

  const labelsHeight = 52;
  const plotTop = labelsHeight - 8;
  const baseline = labelsHeight + 10 + (rows.length - 1) * step + r;
  const plotBottom = baseline + r + 8;
  const height = plotBottom + 30;
  const dots: Dot[] = placed.map((p) => ({ id: p.id, cx: p.cx, cy: baseline - p.row * step }));
  return { width, height, r, x, dots, plotTop, plotBottom };
}

export function CutoffDemo() {
  const [shortlist, setShortlist] = useState(DEFAULTS.shortlist);
  const [band, setBand] = useState(DEFAULTS.band);
  const [minimum, setMinimum] = useState(DEFAULTS.minimum);
  const [width, setWidth] = useState(940);
  const plotRef = useRef<HTMLDivElement>(null);
  const ids = { shortlist: useId(), band: useId(), minimum: useId() };

  // Lay the dots out at the plot's real pixel width, so dots and labels keep their size on every screen.
  useEffect(() => {
    const el = plotRef.current;
    if (!el || !("ResizeObserver" in window)) return;
    const observer = new ResizeObserver((entries) => {
      const w = Math.round(entries[0]?.contentRect.width ?? 0);
      if (w > 0) setWidth(w);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const geo = useMemo(() => layout(width), [width]);
  const result = useMemo(() => placeStudents(DEMO_STUDENTS, { shortlist, band, minimum }), [shortlist, band, minimum]);
  const byId = useMemo(() => new Map(result.placements.map((p) => [p.id, p])), [result]);

  // Moving one line past the other pushes it along, as in the app (band ≤ shortlist).
  const moveShortlist = (v: number) => {
    setShortlist(v);
    if (band > v) setBand(v);
  };
  const moveBand = (v: number) => {
    setBand(v);
    if (shortlist < v) setShortlist(v);
  };

  const changed = shortlist !== DEFAULTS.shortlist || band !== DEFAULTS.band || minimum !== DEFAULTS.minimum;
  const note = describe(result.filled, result.tieExtra, result.fillFloor, minimum);
  const countsSentence = `${result.counts.shortlisted} shortlisted, ${result.counts.cutoff} in the cutoff band, ${result.counts.rejected} rejected.`;

  const xShort = geo.x(shortlist);
  const xBand = geo.x(band);
  // Labels sit outside the band between the lines, so neither line crosses the other's label:
  // the shortlist label to the right of its line, the band label to the left of its line,
  // each flipping only when it would run off the edge.
  const shortLabelLeft = xShort > geo.width - 150;
  const bandLabelRight = xBand < 150;

  return (
    <div className={styles.demo}>
      <dl className={styles.counts}>
        {GROUPS.map((g) => (
          <div key={g.id} className={styles.count} data-group={g.id}>
            <dt className={styles.countLabel}>
              <span className={styles.swatch} aria-hidden="true" />
              {g.label}
            </dt>
            <dd className={styles.countValue}>{result.counts[g.id]}</dd>
          </div>
        ))}
      </dl>

      <div ref={plotRef} className={styles.plot}>
        <svg
          viewBox={`0 0 ${geo.width} ${geo.height}`}
          width="100%"
          role="img"
          aria-label={`42 fictional students placed by score. ${countsSentence}`}
          className={styles.svg}
        >
          <rect
            className={styles.regionBand}
            x={0}
            y={geo.plotTop}
            width={1}
            height={geo.plotBottom - geo.plotTop}
            style={{ transform: `translateX(${xBand}px) scaleX(${Math.max(0, xShort - xBand)})` }}
          />
          <rect
            className={styles.regionShort}
            x={0}
            y={geo.plotTop}
            width={1}
            height={geo.plotBottom - geo.plotTop}
            style={{ transform: `translateX(${xShort}px) scaleX(${Math.max(0, geo.width - xShort)})` }}
          />

          <line className={styles.axis} x1={0} x2={geo.width} y1={geo.plotBottom} y2={geo.plotBottom} />
          {[20, 40, 60, 80, 100].map((t) => (
            <text
              key={t}
              className={styles.tick}
              x={geo.x(t)}
              y={geo.plotBottom + 20}
              textAnchor={t === AXIS_MIN ? "start" : t === AXIS_MAX ? "end" : "middle"}
            >
              {t}
            </text>
          ))}

          {geo.dots.map((d) => {
            const p = byId.get(d.id);
            return (
              <circle
                key={d.id}
                className={styles.dot}
                data-group={p?.group}
                data-filled={p?.filled ? "true" : undefined}
                cx={d.cx}
                cy={d.cy}
                r={p?.filled ? geo.r - 1.25 : geo.r}
              />
            );
          })}

          <g className={styles.threshold} data-group="shortlisted" style={{ transform: `translateX(${xShort}px)` }}>
            <line x1={0} x2={0} y1={20} y2={geo.plotBottom} />
            <text x={shortLabelLeft ? -8 : 8} y={14} textAnchor={shortLabelLeft ? "end" : "start"}>
              Shortlist from {shortlist}
            </text>
          </g>
          <g className={styles.threshold} data-group="cutoff" style={{ transform: `translateX(${xBand}px)` }}>
            <line x1={0} x2={0} y1={40} y2={geo.plotBottom} />
            <text x={bandLabelRight ? 8 : -8} y={34} textAnchor={bandLabelRight ? "start" : "end"}>
              Cutoff band from {band}
            </text>
          </g>
        </svg>
      </div>

      <div className={styles.controls}>
        <Slider id={ids.shortlist} label="Shortlist from" value={shortlist} onChange={moveShortlist} tone="short" />
        <Slider id={ids.band} label="Cutoff band from" value={band} onChange={moveBand} tone="band" />
        <Slider
          id={ids.minimum}
          label="Shortlist at least"
          value={minimum}
          min={0}
          max={30}
          display={minimum === 0 ? "Off" : String(minimum)}
          onChange={setMinimum}
          tone="count"
        />
      </div>

      <div className={styles.footer}>
        <p className={styles.note}>
          {result.filled > 0 ? <span className={styles.ring} aria-hidden="true" /> : null}
          {note}
        </p>
        {changed ? (
          <button
            type="button"
            className={styles.reset}
            onClick={() => {
              setShortlist(DEFAULTS.shortlist);
              setBand(DEFAULTS.band);
              setMinimum(DEFAULTS.minimum);
            }}
          >
            Reset
          </button>
        ) : null}
      </div>

      <p className="visually-hidden" aria-live="polite">
        {countsSentence} {note}
      </p>
    </div>
  );
}

function describe(filled: number, tieExtra: number, floor: number | null, minimum: number): string {
  if (minimum > 0 && filled > 0) {
    const tie = tieExtra > 0 ? `, ${tieExtra === 1 ? "one" : tieExtra} more than asked because of a tie at ${floor}` : "";
    return `${filled} filled to reach the minimum${tie}. Filled students are labelled.`;
  }
  if (minimum > 0) return "The minimum is already met, so nobody is filled.";
  return "Try a minimum of 17: two students tie at 72, and Atlas keeps them together.";
}

type SliderProps = {
  id: string;
  label: string;
  value: number;
  onChange: (v: number) => void;
  tone: "short" | "band" | "count";
  min?: number;
  max?: number;
  display?: string;
};

function Slider({ id, label, value, onChange, tone, min = AXIS_MIN, max = AXIS_MAX, display }: SliderProps) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className={styles.control}>
      <div className={styles.controlHead}>
        <label htmlFor={id}>{label}</label>
        <output htmlFor={id} className={styles.controlValue}>
          {display ?? value}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={styles.range}
        data-tone={tone}
        aria-valuetext={display ?? String(value)}
        style={{ "--pct": `${pct}%` } as CSSProperties}
      />
    </div>
  );
}
