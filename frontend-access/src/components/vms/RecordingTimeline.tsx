import { useRef } from 'react';

export interface TimelineInterval { start: string; end: string; trigger?: string }

interface Props {
  /** Janela visível da régua (ms epoch). */
  viewStartMs: number;
  viewEndMs: number;
  /** Trechos gravados (do backend). */
  intervals: TimelineInterval[];
  /** Posição atual da reprodução (ms epoch) ou null. */
  playheadMs: number | null;
  /** Seleção de evidência (ms epoch) ou null. */
  inMs: number | null;
  outMs: number | null;
  /** Clique/arraste na régua → busca aquele instante. */
  onSeek: (ms: number) => void;
}

const TRIGGER_COLOR: Record<string, string> = {
  motion: 'bg-amber-500/70',
  schedule: 'bg-sky-500/70',
  continuous: 'bg-emerald-500/70',
};

function pct(ms: number, a: number, b: number): number {
  return Math.min(100, Math.max(0, ((ms - a) / (b - a)) * 100));
}

/** Marcações de hora adequadas ao zoom (a cada 1h, 15min ou 5min). */
function ticksFor(a: number, b: number): number[] {
  const span = b - a;
  const step = span > 6 * 3600e3 ? 3600e3 : span > 90 * 60e3 ? 15 * 60e3 : 5 * 60e3;
  const first = Math.ceil(a / step) * step;
  const out: number[] = [];
  for (let t = first; t <= b; t += step) out.push(t);
  return out;
}

function hhmm(ms: number): string {
  return new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Linha do tempo estilo NVR: blocos verdes/âmbar nos horários gravados, régua de
 * horas, playhead e faixa de seleção. Clicar posiciona a reprodução no instante.
 */
export default function RecordingTimeline({ viewStartMs, viewEndMs, intervals, playheadMs, inMs, outMs, onSeek }: Props) {
  const barRef = useRef<HTMLDivElement>(null);

  const seekFromEvent = (clientX: number) => {
    const el = barRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    onSeek(Math.round(viewStartMs + ratio * (viewEndMs - viewStartMs)));
  };

  const hasSel = inMs != null && outMs != null && outMs > inMs;

  return (
    <div className="select-none">
      {/* régua de horas */}
      <div className="relative h-4 text-[10px] text-muted-foreground">
        {ticksFor(viewStartMs, viewEndMs).map((t) => (
          <span key={t} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${pct(t, viewStartMs, viewEndMs)}%` }}>
            {hhmm(t)}
          </span>
        ))}
      </div>

      {/* barra */}
      <div
        ref={barRef}
        className="relative h-12 w-full cursor-pointer rounded-md bg-muted/60 ring-1 ring-border overflow-hidden"
        onClick={(e) => seekFromEvent(e.clientX)}
      >
        {/* trechos gravados */}
        {intervals.map((iv, i) => {
          const a = new Date(iv.start).getTime();
          const b = new Date(iv.end).getTime();
          if (b <= viewStartMs || a >= viewEndMs) return null;
          const left = pct(a, viewStartMs, viewEndMs);
          const right = pct(b, viewStartMs, viewEndMs);
          return (
            <div
              key={i}
              className={`absolute top-2 bottom-2 ${TRIGGER_COLOR[iv.trigger || 'continuous'] || TRIGGER_COLOR.continuous}`}
              style={{ left: `${left}%`, width: `${Math.max(0.4, right - left)}%` }}
              title={`${hhmm(a)} – ${hhmm(b)}`}
            />
          );
        })}

        {/* linhas de hora */}
        {ticksFor(viewStartMs, viewEndMs).map((t) => (
          <div key={t} className="absolute top-0 bottom-0 w-px bg-border/60" style={{ left: `${pct(t, viewStartMs, viewEndMs)}%` }} />
        ))}

        {/* faixa de seleção */}
        {hasSel && (
          <div
            className="absolute top-0 bottom-0 bg-primary/25 ring-1 ring-primary/60"
            style={{ left: `${pct(inMs!, viewStartMs, viewEndMs)}%`, width: `${pct(outMs!, viewStartMs, viewEndMs) - pct(inMs!, viewStartMs, viewEndMs)}%` }}
          />
        )}

        {/* playhead */}
        {playheadMs != null && playheadMs >= viewStartMs && playheadMs <= viewEndMs && (
          <div className="absolute top-0 bottom-0 w-0.5 bg-red-500 pointer-events-none" style={{ left: `${pct(playheadMs, viewStartMs, viewEndMs)}%` }}>
            <div className="absolute -top-1 -left-[3px] h-2 w-2 rotate-45 bg-red-500" />
          </div>
        )}
      </div>
    </div>
  );
}
