import { useEffect, useMemo, useRef, useState } from 'react';

/*
 * Income over time as stacked bars — one colour per kind (Trade, Topmate…),
 * a money scale with soft gridlines, an average line, and a hover card
 * with that bar's breakdown. Sized to its container.
 *
 * buckets: [{ key, label, sub?, tip, parts: { [kindId]: amount }, total, current?, future? }]
 *          `sub` is a second axis line (the weekday letter in the Day view).
 * kinds:   [{ id, label, color }]  (stack order, bottom → top)
 */
const H = 250;            // svg height
const PAD = { top: 16, right: 10, bottom: 28, left: 46 };
const AVG = '#f0b445';    // average line colour

/** A round step so the scale reads 0 / 2k / 4k … rather than 0 / 1,837 … */
function niceStep(max, ticks = 4) {
  if (max <= 0) return 1;
  const raw = max / ticks;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const n = raw / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * pow;
}

export default function IncomeChart({ buckets, kinds, fmt, fmtShort, average, unit, emptyText }) {
  const wrapRef = useRef(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // Grow the bars in on mount (the parent remounts it when the range changes).
  useEffect(() => {
    let inner;
    const outer = requestAnimationFrame(() => { inner = requestAnimationFrame(() => setShown(true)); });
    return () => { cancelAnimationFrame(outer); cancelAnimationFrame(inner); };
  }, []);

  const max = Math.max(0, ...buckets.map(b => b.total));
  const step = niceStep(max);
  const top = Math.max(step, Math.ceil(max / step) * step);
  const ticks = useMemo(() => Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step), [top, step]);

  const twoLine = buckets.some(b => b.sub);
  const bottom = PAD.bottom + (twoLine ? 14 : 0);
  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = H - PAD.top - bottom;
  const n = buckets.length || 1;
  const slot = plotW / n;
  const barW = Math.max(3, Math.min(34, slot * 0.7));
  const y = v => PAD.top + plotH - (v / top) * plotH;
  const xMid = i => PAD.left + slot * i + slot / 2;

  // As many x labels as fit (≥ 18px apart): every day when there's room,
  // else every other one — always the current one too.
  const every = Math.max(1, Math.ceil(18 / Math.max(1, slot)));
  const showLabel = (b, i) => b.current || i % every === 0;

  const hv = hover != null ? buckets[hover] : null;
  const hvLeft = hv ? xMid(hover) : 0;
  const flip = hvLeft > width - 180;

  if (!max) {
    return (
      <div ref={wrapRef} className="h-[150px] flex items-center justify-center text-[12.5px] text-slate-500">{emptyText}</div>
    );
  }

  return (
    <div ref={wrapRef} className="relative select-none" onMouseLeave={() => setHover(null)}>
      {width > 0 && (
        <svg width={width} height={H} role="img"
          aria-label={buckets.filter(b => b.total).map(b => `${b.tip}: ${fmt(b.total)}`).join(', ')}>
          <defs>
            {buckets.map((b, i) => {
              const h = Math.max(0, y(0) - y(b.total));
              return (
                <clipPath key={b.key} id={`ic-${i}`}>
                  <rect x={xMid(i) - barW / 2} y={y(b.total)} width={barW} height={h} rx={Math.min(5, barW / 3)} />
                </clipPath>
              );
            })}
          </defs>

          {/* scale + gridlines */}
          {ticks.map(t => (
            <g key={t}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)}
                stroke="rgba(255,255,255,0.06)" strokeDasharray={t === 0 ? undefined : '3 4'} />
              <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize="10.5" fill="rgb(113,113,122)" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {t === 0 ? '0' : fmtShort(t)}
              </text>
            </g>
          ))}

          {/* hover column */}
          {hv && <rect x={PAD.left + slot * hover} y={PAD.top} width={slot} height={plotH} rx={6} fill="rgba(255,255,255,0.035)" />}

          {/* bars */}
          {buckets.map((b, i) => {
            const cx = xMid(i);
            if (b.future) {
              return <line key={b.key} x1={cx - barW / 2} x2={cx + barW / 2} y1={y(0) - 1} y2={y(0) - 1} stroke="rgba(255,255,255,0.05)" strokeWidth={2} strokeLinecap="round" />;
            }
            if (!b.total) {
              return <rect key={b.key} x={cx - barW / 2} y={y(0) - 2} width={barW} height={2} rx={1} fill="rgba(255,255,255,0.08)" />;
            }
            let acc = 0;
            const dim = hover != null && hover !== i;
            return (
              <g key={b.key} clipPath={`url(#ic-${i})`}
                style={{ transformBox: 'fill-box', transformOrigin: 'center bottom', transform: shown ? 'scaleY(1)' : 'scaleY(0)', transition: `transform 0.55s cubic-bezier(0.22,1,0.36,1) ${Math.min(i * 12, 240)}ms, opacity 0.2s`, opacity: dim ? 0.45 : 1 }}>
                {kinds.map(k => {
                  const v = b.parts[k.id] || 0;
                  if (!v) return null;
                  const y1 = y(acc + v), y0 = y(acc);
                  acc += v;
                  return <rect key={k.id} x={cx - barW / 2} y={y1} width={barW} height={Math.max(0, y0 - y1)} fill={k.color} />;
                })}
                {b.current && <rect x={cx - barW / 2} y={y(b.total)} width={barW} height={Math.max(0, y(0) - y(b.total))} fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth={1.5} rx={Math.min(5, barW / 3)} />}
              </g>
            );
          })}

          {/* average: a clear line with a labelled pill on the left */}
          {average > 0 && (() => {
            const ay = y(average);
            const label = `Avg ${fmt(average)}${unit ? `/${unit}` : ''}`;
            const w = label.length * 6.1 + 14;
            return (
              <g style={{ pointerEvents: 'none' }}>
                <line x1={PAD.left} x2={width - PAD.right} y1={ay} y2={ay} stroke={AVG} strokeOpacity="0.85" strokeWidth="1.5" strokeDasharray="6 4" />
                <rect x={PAD.left + 4} y={ay - 21} width={w} height={17} rx={8.5} fill="#1f1a10" stroke={AVG} strokeOpacity="0.55" />
                <text x={PAD.left + 4 + w / 2} y={ay - 12.5} dy="0.32em" textAnchor="middle" fontSize="10.5" fontWeight="600" fill="#f7cf7b"
                  style={{ fontVariantNumeric: 'tabular-nums' }}>{label}</text>
              </g>
            );
          })()}

          {/* x labels (and the weekday letter under each day) */}
          {buckets.map((b, i) => showLabel(b, i) && (
            <g key={b.key}>
              {b.current && <rect x={xMid(i) - 12} y={PAD.top + plotH + 5} width={24} height={twoLine ? 30 : 17} rx={6} fill="rgba(255,255,255,0.08)" />}
              <text x={xMid(i)} y={PAD.top + plotH + 14} dy="0.32em" textAnchor="middle" fontSize="11"
                fill={b.current ? 'rgb(244,244,245)' : b.total ? 'rgb(161,161,170)' : 'rgb(82,82,91)'} fontWeight={b.current ? 700 : 500}
                style={{ fontVariantNumeric: 'tabular-nums' }}>
                {b.label}
              </text>
              {b.sub && (
                <text x={xMid(i)} y={PAD.top + plotH + 28} dy="0.32em" textAnchor="middle" fontSize="9.5"
                  fill={b.current ? 'rgb(212,212,216)' : 'rgb(113,113,122)'}>{b.sub}</text>
              )}
            </g>
          ))}

          {/* hit areas */}
          {buckets.map((b, i) => (
            <rect key={b.key} x={PAD.left + slot * i} y={PAD.top} width={slot} height={plotH + bottom}
              fill="transparent" onMouseEnter={() => setHover(i)} onTouchStart={() => setHover(i)} />
          ))}
        </svg>
      )}

      {/* hover card */}
      {hv && (
        <div className="absolute z-20 pointer-events-none min-w-[160px] px-3 py-2.5 rounded-xl border border-white/[0.1]"
          style={{
            top: 6,
            left: flip ? undefined : Math.max(0, hvLeft + slot / 2 + 6),
            right: flip ? Math.max(0, width - hvLeft + slot / 2 + 6) : undefined,
            background: 'var(--surface-3)', boxShadow: 'var(--shadow-md)',
          }}>
          <p className="text-[11.5px] text-slate-400">{hv.tip}</p>
          <p className="text-[15px] font-semibold tabular-nums text-slate-50 mt-0.5">{hv.future ? '—' : fmt(hv.total)}</p>
          {hv.total > 0 && (
            <div className="mt-1.5 space-y-1">
              {kinds.filter(k => hv.parts[k.id]).map(k => (
                <p key={k.id} className="flex items-center gap-2 text-[12px]">
                  <span className="w-2 h-2 rounded-sm" style={{ background: k.color }} />
                  <span className="text-slate-300 flex-1">{k.label}</span>
                  <span className="text-slate-200 tabular-nums">{fmt(hv.parts[k.id])}</span>
                </p>
              ))}
            </div>
          )}
          {!hv.total && !hv.future && <p className="text-[11.5px] text-slate-500 mt-0.5">Nothing logged</p>}
        </div>
      )}
    </div>
  );
}
