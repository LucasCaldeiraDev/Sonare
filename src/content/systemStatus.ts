import { GLOBAL_DURATION, GLOBAL_FRAMES, SEGMENT_START_FRAME } from "./timeline";

/**
 * The journey annotated in the system's own voice.
 *
 * Every line below describes something visibly happening on screen at that
 * stretch of the footage — landscape bollards, the projector, the S110 panel,
 * the curtains. Nothing is a spec and nothing is a claim; this is telemetry
 * for the tour, not marketing copy, which is why it renders in the mono face.
 */

export type RailChapter = {
  /** Short label for the rail — the segment's room in one or two words. */
  label: string;
  /** Global frame where the chapter begins (mirrors SEGMENT_START_FRAME). */
  startFrame: number;
};

export const RAIL_CHAPTERS: RailChapter[] = [
  { label: "Fachada", startFrame: SEGMENT_START_FRAME[0] },
  { label: "Home cinema", startFrame: SEGMENT_START_FRAME[1] },
  { label: "Display S110", startFrame: SEGMENT_START_FRAME[2] },
  { label: "Gourmet", startFrame: SEGMENT_START_FRAME[3] },
  { label: "Skyline", startFrame: SEGMENT_START_FRAME[4] },
];

type StatusBeat = {
  /** Global frame from which this line holds, until the next beat takes over. */
  fromFrame: number;
  text: string;
};

/** Two beats per segment: the approach and the reveal. Sorted by frame. */
const STATUS_BEATS: StatusBeat[] = [
  { fromFrame: 0, text: "Chegada · balizadores e paisagismo ativos" },
  { fromFrame: 96, text: "Fachada · luzes internas em cena de chegada" },
  { fromFrame: 193, text: "Entrada · casa em modo noite" },
  { fromFrame: 314, text: "Cena Cinema · projeção e frontais B&W ativos" },
  { fromFrame: 434, text: "Home cinema · sessão em andamento" },
  { fromFrame: 530, text: "Display S110 · painel central da residência" },
  { fromFrame: 627, text: "S110 · comando para a área gourmet" },
  { fromFrame: 723, text: "Gourmet · sanca, pendentes e fitas acesas" },
  { fromFrame: 820, text: "Gourmet · ilha e mesa de jantar prontas" },
  { fromFrame: 916, text: "Cortinas abrem · skyline emoldurado" },
];

/** The chapter index a global frame belongs to. */
export function chapterAt(frame: number): number {
  for (let i = RAIL_CHAPTERS.length - 1; i >= 0; i--) {
    if (frame >= RAIL_CHAPTERS[i].startFrame) return i;
  }
  return 0;
}

/** The status line that holds at a global frame. */
export function statusAt(frame: number): string {
  for (let i = STATUS_BEATS.length - 1; i >= 0; i--) {
    if (frame >= STATUS_BEATS[i].fromFrame) return STATUS_BEATS[i].text;
  }
  return STATUS_BEATS[0].text;
}

/** Seconds on the global timeline for a global frame. */
export function secondsAt(frame: number): number {
  return (frame / (GLOBAL_FRAMES - 1)) * GLOBAL_DURATION;
}

/** mm:ss.d — the tour timecode, always two-digit minutes. */
export function formatTimecode(seconds: number): string {
  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(Math.floor(seconds % 60)).padStart(2, "0");
  const tenth = Math.floor((seconds % 1) * 10);
  return `${mm}:${ss}.${tenth}`;
}

export const TOTAL_TIMECODE = formatTimecode(GLOBAL_DURATION);
