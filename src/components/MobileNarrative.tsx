import { useLayoutEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { gsap, Observer, ScrollTrigger } from "../lib/gsap";
import {
  FPS,
  frameToMediaTime,
  MOBILE_GLOBAL_DURATION,
  MOBILE_GLOBAL_FRAMES,
  MOBILE_POSTER,
  MOBILE_SCROLL_VH_PER_SECOND,
  MOBILE_SEGMENT_START_FRAME,
  MOBILE_SEGMENTS,
} from "../content/timeline";
import { REFRESH_JOURNEY } from "../lib/scrollOrder";
import { createScrubEngine, type ScrubEngine } from "../lib/scrubEngine";

/**
 * The journey on a phone: one pinned frame, the scroll driving global time.
 *
 * This replaces a fallback that played the scenes as separate
 * autoplaying sections. That fallback was honest about what had been validated
 * — it was written before the film had ever run on a handset — but it broke the
 * one thing the piece is about. The visitor was not moving through a house; the
 * visitor was watching clips that happened to be stacked vertically, each
 * running on its own clock at its own speed regardless of the gesture.
 *
 * WHAT IS BORROWED FROM DESKTOP AND WHAT IS NOT. The scroll-to-time mapping,
 * the scrub engine and the overlay timeline are the same, so the narrative and
 * the equipment captions stay identical across the two modes. Four desktop
 * mechanisms are deliberately absent:
 *
 *   the canvas          Desktop composites through one so a poster, ten tracks
 *                       and their seam fades can hand over with no scale, crop
 *                       or colour step between them. Here there are five
 *                       forward tracks and one crossfade rule, and drawImage
 *                       per presented frame is a cost a phone pays in battery
 *                       for a seam it would not have shown anyway.
 *   reverse tracks      Doubling the bytes to make scrolling up stream instead
 *                       of seek is a trade worth making at 4K. At 720x1280 with
 *                       a keyframe every six frames, it is not.
 *   the wheel governor  There is no wheel. Its touch equivalent would be
 *                       hijacking the scroll, which costs more than it buys.
 *   the chapter rail    Screen space a phone does not have to spend.
 *
 * FLINGS ARE NOT FOUGHT, THEY ARE ABSORBED. A touch fling moves at 2000-4000
 * px/s, well past what any runway length can hold under the presentation
 * ceiling (see MOBILE_SCROLL_VH_PER_SECOND). Two things already in the pipeline
 * catch it: ScrollTrigger's scrub damping plays the jump out over its own time
 * constant, and past the scrub engine's forward gap the engine stops chasing
 * and seeks. A flick therefore reads as travelling forward quickly.
 *
 * ONE PROPERTY WORTH NAMING: scrubbing survives blocked autoplay. Seeking a
 * loaded video paints that frame without ever calling play(), so a phone in Low
 * Power Mode — where the old per-scene mode showed nothing but its own black
 * background — still gets the whole film here.
 *
 * "LOADED" IS THE WORD DOING THE WORK IN THAT SENTENCE, and iOS is where it
 * was found not to hold. WebKit on a handset makes two decisions this page
 * never gets a say in: whether `preload` is honoured at all (it is capped at
 * metadata whenever Safari has decided not to preload, typically on cellular,
 * and can be refused outright), and whether play() is permitted (not in Low
 * Power Mode). A track can therefore sit at HAVE_METADATA — file known, no
 * frame decoded — or at HAVE_NOTHING indefinitely, and until it moves the
 * handover gate below has nothing to show. That was the whole symptom on an
 * iPhone: scene 01's poster, then nothing, "the scenes do not load". Three
 * things in the pipeline answer it, each for one state:
 *
 *   HAVE_METADATA     the scrub engine seeks to the target frame instead of
 *                     waiting for readyState to climb by itself — a seek is
 *                     the one request WebKit answers by preparing the pipeline
 *                     it declined to prepare for preload.
 *   HAVE_NOTHING +    `warm` primes the track through the engine: play() with
 *   NETWORK_IDLE      a pause queued behind it, since play() is the only call
 *                     that makes a WebKit that has refused to preload fetch.
 *   refused play()    the engine retries every couple of seconds rather than
 *                     giving up for the visit — the refusal lifts with Low
 *                     Power Mode or the first real touch on the page.
 */

type Props = {
  id?: string;
  /** Extra scroll runway held past MOBILE_GLOBAL_DURATION, in seconds — see CanvasNarrative. */
  settle?: number;
  closing?: ReactNode;
  hero?: ReactNode;
};

/**
 * ScrollTrigger catch-up, in seconds — half of desktop's 1.1, because the
 * gestures are not comparable.
 *
 * A wheel is discrete: ~100 px arriving in one jump every few tens of ms, so
 * damping is what turns a staircase into movement and a long constant is a
 * feature. A drag is continuous and, worse, the finger is ON the picture — at
 * 1.0 the frame the visitor is dragging visibly trails their thumb and arrives
 * after they stop, which reads as the film responding to the scroll rather than
 * being driven by it.
 *
 * Not lower than this, though. The constant is also what absorbs a fling: it
 * spreads the jump over its own time so the scrub engine sees a ramp instead of
 * a teleport. Measured at 0.5 the presented step stays at one frame per
 * animation frame, which is the whole budget there is.
 */
const SCRUB = 0.3;
/*
 * 0.3, down from 0.5, once the governor and the film-level limiter existed:
 * the fling-absorbing job this constant used to do alone is now done by the
 * band, and what remained of it was pure latency — every reversal of the
 * gesture waited for the scrub tween to decelerate and turn, on top of the
 * bank it had to pay back. Not lower: a wheel-less phone still needs the
 * damping to turn 60 discrete scroll writes a second into movement.
 */

/**
 * `?diag=1` shows a live readout over the film. Deliberately NOT gated on
 * DEV: the only place this defect appears is a real handset loading the real
 * deployed build, so a diagnostic that is compiled out of production cannot
 * see it. It renders nothing unless the flag is present.
 */
const diagOn =
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).get("diag") === "1";

/**
 * How close the incoming track must be to the boundary frame before the swap.
 * Two frames: one for the rounding between logical frames and media time, one
 * of slack so a decoder that lands a frame early still satisfies the gate.
 */
const HANDOVER_TOL = 2 / 24;

/**
 * Longest the gate may hold the outgoing frame. The gate exists to cover the
 * few milliseconds a decoder needs, not to freeze the picture: past this the
 * swap happens regardless and the incoming track catches up on screen, which
 * is a worse frame for an instant and a better one than a stall.
 */
const HANDOVER_MAX_MS = 220;

/**
 * How far ahead a track is promoted from preload="none" to "auto", in logical
 * frames. 72 is three seconds of footage — at the deliberate reading pace the
 * runway is tuned for, about two seconds of wall clock, which is enough of a
 * head start on a mobile connection to have the boundary frame decodable by
 * the time the gate asks for it.
 */
const PRELOAD_LEAD_FRAMES = 72;

/**
 * Length of each seam dissolve, in logical frames, driven by scroll POSITION
 * rather than wall clock so it plays and reverses with the gesture.
 *
 * Longer than desktop's flat 3, and the reason is a property these two seams
 * have that desktop's do not: the INCOMING scene is nearly still. Measured
 * between its own first two frames, scene 03 opens at 36.5 dB and scene 04 at
 * 56.1 dB — the second is essentially a frozen frame. That cuts both ways.
 * It is why the step is so visible (there is no motion for it to hide behind)
 * and it is also why a long dissolve is safe here: cross-fading two nearly
 * identical stills cannot ghost, because neither picture is moving during the
 * fade. Desktop's 3 frames were chosen over footage that IS moving, where a
 * long blend would smear.
 *
 * Only one seam still needs it. 02 -> 03 was the other, and it is now a
 * straight cut again: the four interpolated frames appended to scene 02 put
 * the join within about a decibel of the camera's own per-frame travel, and a
 * dissolve over a seam that is genuinely continuous only softens something
 * that did not need softening.
 */
const SEAM_FADE_FRAMES: Record<number, number> = { 3: 10 };

/**
 * Scene INDEXES whose start is dissolved rather than cut.
 *
 * Measured the way CanvasNarrative measures its own seams, which is the only
 * fair yardstick: a jump matters in proportion to the motion it has to hide
 * behind, so each seam is compared against the step the INCOMING scene takes
 * between its own first two frames.
 *
 *   01 -> 02   seam 34.0 dB vs own step 26.0 — 8.0 dB BETTER than the motion
 *              around it. Scene 02 opens on a push-in, and the join is
 *              cleaner than one frame of that push. Cut, and invisible.
 *   02 -> 03   seam 29.5 dB vs the bridged scene 02's own closing steps of
 *              31.5 / 30.4 / 30.9 — about a decibel adrift, i.e. one more
 *              frame of the same camera travel. Cut. This one was 25.5 dB
 *              and 10.9 adrift until four interpolated frames were appended
 *              to scene 02 to fill a real hole in the camera path; see
 *              tools/make-mobile.sh.
 *   03 -> 04   seam 33.8 dB vs own step 56.1 — 22 dB adrift, and now the only
 *              one left. Scene 04 opens nearly frozen; against a picture that
 *              still, even a mild step reads as a pop. This is the seam the
 *              raw numbers flatter and the eye does not, and unlike 02 -> 03
 *              it is not a position offset at all: a translation search over
 *              +/-12 px in both axes finds its optimum at exactly dx=0, dy=0,
 *              so there is no hole to bridge and nothing to align.
 */
const SEAM_AT = new Set([3]);

/**
 * Smoothstep on the dissolve, which is what buys the extra length for free.
 *
 * A linear fade spends as long near 50/50 as it does anywhere else, and 50/50
 * is the one mixture that reads as a double image if the visitor happens to
 * stop there — the risk that normally argues against a long dissolve. This
 * curve is flat at both ends and steepest in the middle, so it eases in and
 * out of the blend and crosses the ambiguous centre half again as fast as a
 * linear ramp would. The window gets longer where it helps and shorter where
 * it hurts.
 */
const smoothstep = (t: number) => t * t * (3 - 2 * t);

/** `?seam=off` restores the hard cut, for comparing the two by hand. */
const seamOn =
  !import.meta.env.DEV || new URLSearchParams(window.location.search).get("seam") !== "off";

/**
 * The touch governor — the wheel governor from CanvasNarrative, ported to the
 * one input a phone has.
 *
 * Same premise, and it is arithmetic rather than taste: a screen refreshing at
 * R Hz showing 24 fps media can present at most R/24 times real time, and a
 * gesture that asks for more cannot be answered — the playhead runs to the
 * ceiling, arrives, stops, repeats. Measured here on a violent flick: peak
 * 8880 px/s, single steps of 44 and 66 frames. Those are the seek path opening
 * up because the scrub could no longer be caught by playing.
 *
 * So the INPUT is capped, exactly as on desktop: the gesture is swallowed into
 * a backlog and released into the scroll at a rate the presentation path can
 * sustain. Capping the input rather than the picture is what keeps the film,
 * the captions and the scroll position agreeing with each other.
 *
 * WHAT COULD NOT BE PORTED IS THE INTERCEPTION. Desktop calls preventDefault on
 * wheel events. The touch equivalent kills native scrolling outright, momentum
 * and all, so the governor has to own the gesture completely — hence Observer
 * with preventDefault, enabled only while the film is pinned. Everywhere else
 * on the page the scroll stays native and untouched.
 *
 * The trade this makes is smaller on a phone than it first appears. The section
 * is PINNED: nothing on screen tracks the finger one-to-one, so there is no
 * direct-manipulation contract to break. The only feedback a gesture has here
 * is the film advancing, which is precisely the thing being metered.
 *
 * A BAND, NOT A CEILING. Desktop meters the wheel with a ceiling (the budget)
 * and a floor (a wheel notch always advances at least three frames). This
 * governor has both too, and on a phone they are deliberately CLOSE: while
 * the visitor is asking for movement the film advances at a story rate
 * between GOVERNOR_MIN_RATE and GOVERNOR_MAX_RATE, whatever the finger's own
 * speed — a slow drag does not crawl frame by frame and a fling does not
 * sprint. The finger decides how LONG the film moves (it fills the backlog);
 * the band decides how FAST. That is the request from the handset, and it is
 * also what the decoder wants: a playbackRate that barely changes is the one
 * thing AVPlayer presents without a hitch, where a rate that follows every
 * wobble of a thumb is rewritten many times a second and pays for each one.
 *
 * Where in the band: proportional to how full the backlog is. A fling banks
 * the cap and plays out at the top; as the bank drains the rate eases toward
 * the floor, which reads as momentum settling rather than a cut-off.
 *
 * THE NUMBERS. 1.25–1.4x was the cadence-perfect choice (30 fps is exactly
 * two refreshes per frame at 60 Hz and four at 120) and it was judged a
 * little slow on the handset, so the band sits at 1.5–1.75x by request.
 * Inside it the engine still snaps to the nearest even cadence where one is
 * close — 1.667x is 40 fps, exactly three refreshes per frame on a 120 Hz
 * panel and a regular 2-1 alternation on a 60 Hz one — so a coast near the
 * top of the band presents evenly. `?gmin=` and `?gmax=` override both in
 * the deployed build, since this is tuned by feel on the device.
 */
const GOVERNOR_MIN_RATE = 1.5;
const GOVERNOR_MAX_RATE = 1.75;

/**
 * The floor in STORY FRAMES for a single gesture — the desktop's
 * GOVERNOR_MIN_STEP_FRAMES, same reasoning: a touch delta of a few pixels is
 * a fraction of one frame, and a picture that does not change under a moving
 * finger reads as the page being heavy. Applied to the pending TOTAL, never
 * per event, for the reason recorded on desktop: per-event inflation turns a
 * stream of small deltas into thousands of pixels of demand.
 */
const GOVERNOR_MIN_STEP_FRAMES = 3;

/**
 * Ceiling on the backlog, in seconds of STORY. A fling banks at most this
 * much and coasts it out inside the band — about a second of wall clock at
 * the top of the band. Comfortably under the scrub engine's FORWARD_SEEK_GAP
 * (1.5 s) once the engine's own 2x ceiling is allowed for: the picture is
 * always able to catch a target that moves at GOVERNOR_MAX_RATE by playing,
 * so a coast never turns into a seek.
 */
const GOVERNOR_BACKLOG_S = 1.5;

/**
 * MOMENTUM. A finger that lifts while still moving used to stop the film
 * within a few frames: the backlog held only what the last touch deltas had
 * put in it (the three-frame floor, typically), and that drained in a tick.
 * The handset asked for the film to keep going and settle, the way a native
 * scroll does. So on release the finger's velocity is banked as story:
 * `|velocity| x GOVERNOR_COAST_S` pixels, never less than GOVERNOR_COAST_MIN_S
 * of story when the finger was actually moving (GOVERNOR_COAST_MIN_PX_S), and
 * never more than the backlog cap. A finger that stopped before lifting banks
 * nothing — that visitor meant to stop.
 *
 * And the release TAPERS once the finger is up: over the last
 * GOVERNOR_TAIL_S of story in the backlog the rate eases from the band down
 * to GOVERNOR_TAIL_FLOOR_RATE, so the film glides to rest instead of running
 * at the floor and stopping dead. While the finger is down the band applies
 * untapered — the floor is the point there.
 */
const GOVERNOR_COAST_S = 0.25;
const GOVERNOR_COAST_MIN_S = 0.35;
const GOVERNOR_COAST_MAX_S = 0.9;
const GOVERNOR_COAST_MIN_PX_S = 80;
const GOVERNOR_TAIL_S = 0.5;
const GOVERNOR_TAIL_FLOOR_RATE = 0.35;

/**
 * THE GESTURE IS IN CHARGE OF THE BANK. Three rules, all from the handset:
 *
 *   a reversal drops the opposite bank at once — a delta against what is
 *   banked used to merely subtract from it, so the film kept going the old
 *   way until the visitor had dragged the whole bank back ("it does not
 *   obey, then two seconds later it does");
 *
 *   a finger held still on the screen freezes the release — nothing is
 *   drained while there has been no touch delta for GOVERNOR_STILL_MS, so a
 *   stop is a stop, with the bank kept for when the finger moves again;
 *
 *   a finger lifted while still drops the bank entirely — that visitor
 *   meant to stop, and a coast after a deliberate stop reads as the page
 *   ignoring them.
 */
const GOVERNOR_STILL_MS = 90;

/**
 * Hard cap on the story rate the governor will permit, ABOVE what the refresh
 * measurement alone would allow — and the reason mobile needs one where
 * desktop does not.
 *
 * Desktop derives its ceiling as refreshHz / 24 and stops there, because on a
 * desktop the screen genuinely is the binding constraint: a machine with
 * hardware H.264 decode will feed 4K frames faster than a 60 Hz panel can show
 * them. A phone inverts that. Here the panel is often 120 Hz — which the
 * formula reads as licence for a 3x story rate, i.e. 72 decoded frames per
 * second — while the decoder is simultaneously holding four stacked video
 * elements alive and losing cycles to the compositor and the scroll. Decode,
 * not presentation, is what runs out first, and asking for 3x is exactly the
 * "frames that cannot be presented" case the desktop note warns about: the
 * playhead runs to the ceiling, arrives, stops, repeats. That burst-pause is
 * the stutter, and the frames it skips are the scrub engine falling off its
 * play path into seeks.
 *
 * 2x is still double real time — fast enough that a deliberate scroll never
 * feels held back — and it is a rate a phone can actually sustain.
 */
const MOBILE_RATE_CEILING = 2;

/** Refresh rates outside this band are a bad measurement, not a real display. */
const REFRESH_MIN_HZ = 50;
const REFRESH_MAX_HZ = 240;
const REFRESH_FALLBACK_HZ = 60;

/**
 * `?governor=off` restores the raw gesture; `?gmin=1.25&gmax=1.6` set the
 * band. All three work in the deployed build, because the band is the one
 * tuning that cannot be settled from a desk: it is judged by feel, on the
 * decoder in the visitor's hand, and phones differ by more than desktops do.
 * Comparing two values on the actual device is a query string rather than a
 * rebuild.
 */
const query = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
const governorParam = query?.get("governor") ?? null;
const bandParam = (name: string, fallback: number) => {
  const v = Number(query?.get(name));
  return Number.isFinite(v) && v >= 1 && v <= MOBILE_RATE_CEILING ? v : fallback;
};
const governorMinRate = bandParam("gmin", GOVERNOR_MIN_RATE);
const governorMaxRate = Math.max(governorMinRate, bandParam("gmax", GOVERNOR_MAX_RATE));

/**
 * iOS is WebKit driving the scroll from the compositor, which is why the
 * governor needs one more thing there than it needed anywhere else.
 *
 * The governor's method is: preventDefault on the touch so the page does not
 * scroll itself, then hand the scroll back with window.scrollTo at a metered
 * rate. For one round iOS got no governor at all, because on a handset the
 * second half visibly failed — the page did not move while you dragged it —
 * and the failure was read as WebKit refusing main-thread scroll writes while
 * a finger is down. It is not that. It is that on iOS the compositor decides
 * at the START of a gesture whether it owns the pan, and it decides from CSS,
 * not from what a touchmove listener will do a few milliseconds later: unless
 * `touch-action` has taken vertical panning away from it, it claims the
 * gesture, preventDefault arrives too late to matter, and every scrollTo the
 * governor makes is overridden by a native scroll that is not moving because
 * the touchmove was cancelled. Both halves fail together, which is exactly
 * what was seen.
 *
 * GSAP's own normalizeScroll is the proof, because it does precisely what the
 * governor does — Observer with preventDefault, scroll written from JS — and
 * it works on iOS. On enable it writes `touch-action: pan-x pinch-zoom` on
 * <html> and <body>, forces `scroll-behavior: auto`, and keeps the scroll off
 * exactly 0 (an iOS bug makes TouchEvent.clientY unreliable there). `claim`
 * below mirrors those three lines, and that is the whole difference.
 *
 * The check is the platform, not the brand: every browser on iOS is this
 * WebKit. iPadOS reports itself as a Mac, hence the touch-points test.
 *
 * `?governor=off` still restores the raw gesture, and it now works in the
 * deployed build too — the phone is the only place the comparison means
 * anything. If the page ever stops moving under the finger again, `drive`
 * notices scroll writes that do not land and switches the governor off by
 * itself; the readout says `gov auto-off` when that has happened.
 */
const isWebKitTouch =
  typeof navigator !== "undefined" &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

const governorOff = governorParam === "off";

/**
 * How the governor decides the page is not its to move, and stands down.
 *
 * Judged over whole seconds, never per tick. The first version compared
 * window.scrollY right after each scrollTo and gave up after half a second of
 * writes that "did not land" — and on iOS the position a write produces can
 * be reported a frame or two late, so that test stood the governor down on a
 * page that was moving perfectly well, and the handset scrolled ungoverned
 * while the code believed it had tried. Now: over each window, add up how far
 * the governor released; at the end of it, look at how far the page actually
 * went. Two consecutive windows in which a real distance was released and
 * the page covered under a fifth of it is the compositor owning the gesture
 * (see governorOff). Anything less is noise, or the page's own ends.
 */
const GOVERNOR_STUCK_WINDOW_MS = 1000;
const GOVERNOR_STUCK_WINDOWS = 2;
const GOVERNOR_STUCK_MIN_RELEASE_PX = 100;
const GOVERNOR_STUCK_LANDED_SHARE = 0.2;

/**
 * THE FILM-LEVEL LIMITER, and why there are two.
 *
 * The scroll governor above meters the GESTURE: it needs to own the touch,
 * write the scroll itself and have the page follow — three things WebKit on
 * a phone has a say in, and the handset kept scrolling ungoverned while every
 * one of them worked in emulation. So the band is enforced a second time, at
 * the one place nothing outside this file can interfere with: between the
 * frame the scroll asks for and the frame the film is handed. `drive` moves
 * the shown frame toward the wanted one at no more than GOVERNOR_MAX_RATE,
 * whatever the scroll does. When the scroll governor is working the wanted
 * frame never outruns the band and this is a pass-through; when it is not,
 * this is the limiter the visitor feels. It depends on nothing but the ticker.
 *
 * A fling can still put the wanted frame far ahead of the shown one. Two
 * earlier versions closed that lag with a JUMP — first whenever it exceeded a
 * cap (which re-coupled the film to a racing scroll), then only once the
 * scroll was at rest. The second was what the handset reported as "leaving
 * the S110 it takes me straight to the end of the last scene": a fling to
 * the end put the wanted frame at the film's end, the scroll came to rest,
 * and the one cut landed three seconds before the end — scenes 03 and 04
 * simply never played. No jump, then, ever. Past this many seconds of lag
 * the shown frame catches up at the engine's own ceiling (2x) instead of
 * the band's top, which is the most the decoder will present cleanly; below
 * it, the band. The film always plays every frame between where it is and
 * where the scroll went, and the hero fade and the closing follow the SHOWN
 * frame (see storyTl), so the closing cannot appear over a film still on
 * its way there.
 */
const FILM_CATCH_UP_LAG_S = 3;
/** Wanted-frame speed, in frames per second, below which the scroll counts as at rest. */
const FILM_SETTLED_FPS = 2;
/**
 * Wanted-frame speed, in frames per second, above which the scroll is not a
 * gesture but a navigation — the logo going home, an anchor — and the film
 * SNAPS to it instead of playing its way there. 480 is twenty times real
 * time: no touch under the governor comes near it (the band tops out at
 * 1.75x), and even an ungoverned native fling peaks well under it. An
 * instant scroll produces thousands.
 */
const FILM_SNAP_FPS = 480;

/** Data Saver: no background fetch, the tracks stream as they did before. */
const SAVE_DATA =
  typeof navigator !== "undefined" &&
  (navigator as { connection?: { saveData?: boolean } }).connection?.saveData === true;

/**
 * The picture fills the screen, and that is the only framing there is.
 *
 * This carried two alternatives for a while — `?frame=45` and `?frame=169`,
 * which gave screen height back in exchange for seeing more of the room. They
 * existed to settle a question the LANDSCAPE media posed: with a 16:9 frame
 * filling a portrait screen, object-fit: cover decided the visible field from
 * the screen's ratio alone and discarded about three quarters of every shot,
 * and no crop of the file could change that. Framing the footage vertically in
 * the first place answered it instead, so the alternatives went out with the
 * media they pointed at. See docs/portrait-mobile-spec.md.
 */
const VIDEO_BOX = "absolute inset-0 z-[2]";
/** svh, not lvh: the frame may run under the address bar, the words may not. */
const COPY_BOX = "absolute inset-x-0 top-0 z-30 h-[100svh]";

/**
 * LOCAL COPIES. Every track is fetched whole, in order, and each element is
 * pointed at a blob: URL of its file the moment the bytes are in. Until then
 * the element has NO src at all. After that a seek is a memory read.
 *
 * This is the answer to "the scenes take ages to load" on an iPhone, and the
 * reason it is the answer is where the slow path actually was. It was never
 * the decode — 720x1280 GOP-6 is nothing to a phone — it was that on iOS
 * every seek into footage that has not arrived yet is a fresh HTTP range
 * request from AVFoundation, which keeps its own network stack, shares
 * nothing with the page's cache, and takes a few hundred milliseconds per
 * round trip on a cellular link. This engine seeks for every backward step,
 * every fling and every frame in Low Power Mode, so on a phone the seek path
 * IS the film for a good share of the visit. And the scene boundary paid it
 * twice: the next track was only fetched from three seconds of story before
 * its cut, which is two seconds of wall clock for two megabytes, and the
 * handover held the outgoing frame until those bytes were in.
 *
 * With the bytes local, none of that is on the network any more. The blob is
 * still fed to AVFoundation through WebKit's resource loader, so iOS's
 * preload policies still apply to the ELEMENT (it can sit at HAVE_METADATA
 * until a seek asks for a frame — see the engine), but the answer to that
 * seek now comes from memory.
 *
 * WHY NO STREAMING SRC IN THE MEANTIME. The first version of this kept scene
 * 01 streaming from the network while its copy was fetched last, and only
 * swapped a track to its copy while the eye was off it, because a src change
 * resets the element. On the phone that produced exactly the report it was
 * meant to fix: scene 01 was the one scene the visitor was looking at, so it
 * was the one scene that never got its copy — it stayed on the network-bound
 * seek path for the whole first pass, and only worked once the visitor had
 * scrolled through everything and come back. So: no network src. Scene 01 is
 * fetched first, the poster holds the opening frame while it arrives, and the
 * bar under the hero shows how far along it is. On a good link that is a
 * second or two the visitor spends reading the headline anyway; on a poor one
 * it is an honest wait instead of a picture that jerks. Each file is also
 * fetched exactly once this way, where streaming-then-copying cost iOS the
 * first file twice.
 *
 * FALLBACKS. A fetch that fails points that track at its network file and
 * the film goes on as it did before. A media pipeline that refuses a blob:
 * source (Playwright's WebKit on Windows does; iOS does not) sends every
 * track back to the network the same way, once. Under Data Saver nothing is
 * fetched and the tracks stream from the start.
 *
 * COST. 11.4 MB for the four files, fetched only on the phone path and only
 * once (the CDN serves them immutable, so the second visit is the cache).
 * Desktop moves many times that for the same film.
 */
const PREFETCH_ORDER = [0, 1, 2, 3];

export function MobileNarrative({ id, settle = 2, closing, hero }: Props) {
  const sectionRef = useRef<HTMLElement>(null);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);
  const heroRef = useRef<HTMLDivElement>(null);
  const closingRef = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);
  const loadBarRef = useRef<HTMLDivElement>(null);
  const diagRef = useRef<HTMLPreElement>(null);

  /** Where the scroll wants to be, in global logical frames. Written by ScrollTrigger. */
  const targetFrameRef = useRef(0);

  useLayoutEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const total = MOBILE_GLOBAL_DURATION + settle;

    /** The track currently on screen. Only this one is ever targeted at the scroll. */
    let active = 0;
    /** Non-null while the gate is holding the outgoing frame for an incoming one. */
    let gate: { to: number; since: number } | null = null;
    /** True while a seam dissolve is on screen, so it can be cleared exactly once. */
    let dissolving = false;

    /**
     * Governor state. `backlog` is scroll the visitor has asked for and not yet
     * been given, in pixels, released by the ticker at a bounded rate.
     */
    let backlog = 0;
    /** Sub-pixel remainder of the release, carried between ticks. */
    let carry = 0;
    /** When the last touch delta arrived — a still finger freezes the release. */
    let lastTouchMoveAt = 0;
    let journeyActive = false;
    /** The scroll-driven timeline and the film-driven one — see storyTl below. */
    let scrollTl: gsap.core.Timeline | null = null;
    let storyTl: gsap.core.Timeline | null = null;

    /**
     * The display's own rate, measured rather than assumed — a 120 Hz phone may
     * present twice the story a 60 Hz one can, and half the handsets this will
     * run on are 120 Hz. Median of the first frame gaps, so one hitch during
     * startup cannot decide the budget for the whole session.
     */
    let refreshHz = REFRESH_FALLBACK_HZ;
    const gaps: number[] = [];
    let lastFrameAt = 0;
    const measureRefresh = (time: number) => {
      if (lastFrameAt) gaps.push(time - lastFrameAt);
      lastFrameAt = time;
      if (gaps.length < 24) return;
      gaps.sort((a, b) => a - b);
      const hz = 1000 / gaps[gaps.length >> 1];
      if (hz >= REFRESH_MIN_HZ && hz <= REFRESH_MAX_HZ) refreshHz = Math.round(hz);
      gsap.ticker.remove(measureRefresh);
    };
    gsap.ticker.add(measureRefresh);

    /**
     * Story rate the film may advance at, in multiples of real time. Never
     * below 1 — the story has to be able to advance at least at its own pace
     * even on a slow panel — and never above MOBILE_RATE_CEILING, which is
     * where a phone's decoder gives out well before its screen does.
     */
    const rateCeiling = () =>
      Math.min(MOBILE_RATE_CEILING, Math.max(1, refreshHz / FPS));

    /**
     * The scrub engines, ceilinged by the SAME function the governor spends
     * against.
     *
     * They have to come from one place. The governor decides how fast the
     * story may be asked to advance and the engine decides how fast the
     * picture is allowed to chase it; if the second is the larger of the two,
     * the extra is not headroom, it is licence to overshoot a target the
     * governor was never going to move that fast — and every overshoot on a
     * phone is paid for backwards, where there are no reverse companions to
     * play through. One function, read live, keeps them from disagreeing.
     */
    const engines: (ScrubEngine | null)[] = MOBILE_SEGMENTS.map((seg, i) => {
      const el = videoRefs.current[i];
      return el ? createScrubEngine(el, seg.duration, { rateCeiling }) : null;
    });

    /** Pixels of scrolling that equal one second of story, from the runway. */
    const pxPerStorySecond = () => (MOBILE_SCROLL_VH_PER_SECOND / 100) * window.innerHeight;
    /** Pixels of scrolling that equal one frame of story — the unit of the floor. */
    const pxPerStoryFrame = () => pxPerStorySecond() / FPS;

    /** Pixels of banked gesture the governor will hold — see GOVERNOR_BACKLOG_S. */
    const backlogCap = () => GOVERNOR_BACKLOG_S * pxPerStorySecond();

    /**
     * Pixels per second the page may scroll right now: the band, placed by how
     * full the backlog is (see GOVERNOR_MIN_RATE), times the runway. Never above
     * what the engine can chase by playing, so the coast stays off the seek
     * path even if a query string asks for more.
     */
    const governorRate = () => {
      const fill = Math.min(1, Math.abs(backlog) / backlogCap());
      let rate = governorMinRate + (governorMaxRate - governorMinRate) * fill;
      // Finger up: the tail of the backlog eases the film to rest — see
      // GOVERNOR_TAIL_S. Finger down, the band applies as is.
      if (observer && !observer.isPressed) {
        const tail = smoothstep(Math.min(1, Math.abs(backlog) / (GOVERNOR_TAIL_S * pxPerStorySecond())));
        rate = GOVERNOR_TAIL_FLOOR_RATE + (rate - GOVERNOR_TAIL_FLOOR_RATE) * tail;
      }
      return Math.min(rate, rateCeiling()) * pxPerStorySecond();
    };

    /**
     * The gesture, swallowed. Enabled only while the film owns the screen — the
     * rest of the page keeps its native scrolling, momentum included.
     *
     * deltaY is inverted on the way in because Observer reports finger travel
     * and the page scrolls the other way, the same conversion normalizeScroll
     * makes for its own momentum.
     */
    /**
     * Take the vertical pan away from the compositor while the film owns the
     * screen, and give it back after — the lines normalizeScroll writes on
     * enable, and the reason the governor works on iOS at all. See governorOff.
     */
    const claim = () => {
      document.documentElement.style.touchAction = "pan-x pinch-zoom";
      document.body.style.touchAction = "pan-x pinch-zoom";
      // ScrollTrigger writes this back to "smooth" after every refresh (it
      // saw the stylesheet's value at init and restores it), so this line
      // only holds between refreshes. The scroll writes in `drive` carry
      // `behavior: "instant"` themselves, which is what actually protects
      // them; this is the belt to that pair of braces.
      document.documentElement.style.scrollBehavior = "auto";
    };
    const release = () => {
      document.documentElement.style.removeProperty("touch-action");
      document.body.style.removeProperty("touch-action");
      document.documentElement.style.removeProperty("scroll-behavior");
    };

    /** Set by `drive` once the page stopped following — see GOVERNOR_STUCK_WINDOW_MS. */
    let governorFailed = false;
    let stuckWindows = 0;
    let releasedSinceCheck = 0;
    let scrollAtCheck = 0;
    let lastStuckCheckAt = 0;
    /** Readout counters: touch deltas received, scroll released, scroll observed. */
    let touchEvents = 0;
    let releasedTotal = 0;
    let landedTotal = 0;
    /** The frame the film is actually handed — see FILM_LAG_CAP_S. */
    let shownFrame = 0;
    /** The wanted frame last tick and its smoothed speed, for the at-rest test. */
    let wantedPrev = 0;
    let wantedFps = 0;

    const observer = governorOff
      ? null
      : Observer.create({
          target: window,
          type: "touch",
          preventDefault: true,
          // preventDefault on the press swallows the tap that would have
          // become a click; Observer re-dispatches it on a release that did
          // not drag, which is what keeps the hero's links tappable.
          allowClicks: true,
          // Observer's default drag tolerance is 10 px, which is more than a
          // deliberate nudge travels; below it nothing reaches onChange and
          // the floor has nothing to top up. 4 px is above finger tremor and
          // matches the 3 px past which Observer stops treating a release as
          // a tap, so a tap stays a tap and anything larger is a gesture.
          tolerance: 4,
          // The finger lifts while moving: bank its speed as story so the
          // film coasts and settles instead of stopping dead — see
          // GOVERNOR_COAST_S. Observer's velocity has the finger's sign, so
          // it is inverted like the deltas.
          onDragEnd: (self) => {
            const v = -self.velocityY;
            // Lifted while still: stop, and drop whatever was banked.
            if (Math.abs(v) < GOVERNOR_COAST_MIN_PX_S) {
              backlog = 0;
              return;
            }
            const pxs = pxPerStorySecond();
            const coast = Math.min(
              GOVERNOR_COAST_MAX_S * pxs,
              Math.max(GOVERNOR_COAST_MIN_S * pxs, Math.abs(v) * GOVERNOR_COAST_S),
            );
            // Same direction as what is already banked: top it up to the
            // coast. A reversal drops the old bank and coasts the new way.
            if (Math.sign(backlog) === Math.sign(v)) backlog = Math.sign(v) * Math.max(Math.abs(backlog), coast);
            else backlog = Math.sign(v) * coast;
          },
          onChangeY: (self) => {
            touchEvents += 1;
            lastTouchMoveAt = performance.now();
            const delta = -self.deltaY;
            // Against the bank: the bank is gone, this delta is the new one.
            // See GOVERNOR_STILL_MS.
            if (delta !== 0 && Math.sign(delta) !== Math.sign(backlog)) backlog = 0;
            backlog += delta;
            // The floor raises the pending TOTAL to one visible step — see
            // GOVERNOR_MIN_STEP_FRAMES. A gesture already above it is left at
            // its own true size.
            const floor = GOVERNOR_MIN_STEP_FRAMES * pxPerStoryFrame();
            if (backlog !== 0 && Math.abs(backlog) < floor) backlog = Math.sign(backlog) * floor;
          },
        });
    observer?.disable();

    videoRefs.current.forEach((el, i) => {
      if (!el) return;
      el.style.opacity = i === 0 ? "1" : "0";
      // React writes `muted` as a property and never as the attribute. The
      // property is what WebKit's autoplay policy reads at play() time, so
      // this is belt and braces — but `defaultMuted` is the attribute, and
      // an element that ever reloads (see `warm`) comes back with its
      // attributes, not with whatever a property once said.
      el.muted = true;
      el.defaultMuted = true;
    });

    /** Global logical frame -> which segment holds it, and where inside it. */
    const locate = (globalFrame: number) => {
      let index = 0;
      for (let i = MOBILE_SEGMENTS.length - 1; i >= 0; i--) {
        if (globalFrame >= MOBILE_SEGMENT_START_FRAME[i]) {
          index = i;
          break;
        }
      }
      const local = Math.min(
        Math.max(globalFrame - MOBILE_SEGMENT_START_FRAME[index], 0),
        MOBILE_SEGMENTS[index].frames - 1,
      );
      return { index, local };
    };

    /**
     * How long a track that reports a media error is left alone before it is
     * reloaded. Long enough that a file which genuinely cannot be fetched
     * does not hammer the server sixty times a second; short enough that a
     * track iOS unloaded under memory pressure is back well inside the
     * PRELOAD_LEAD_FRAMES head start.
     */
    const RELOAD_INTERVAL_MS = 3000;
    const lastReloadAt: number[] = MOBILE_SEGMENTS.map(() => 0);

    /**
     * Bring a track's data in without disturbing whatever it is already doing.
     *
     * Called every tick for the active track and, inside the lead, for the
     * next one — so everything past the first branch has to be cheap and
     * idempotent. The states it answers, in the order a track passes through
     * them:
     *
     *   preload still "none"     promote it and nudge. Chrome starts fetching
     *                            on the attribute alone; Safari wants load(),
     *                            and it is only safe while the element holds
     *                            no frames to throw away.
     *   HAVE_NOTHING + IDLE      asked, and refused: the agent looked at the
     *                            promoted preload and decided to fetch nothing.
     *                            Only a WebKit that will not preload does this,
     *                            and only play() moves it — see engine.prime.
     *   a media error            the element is dead until load() is called
     *                            again. iOS reaches this by unloading a hidden
     *                            track under memory pressure; a decode error
     *                            reaches it too. Either way a reload is the
     *                            only way back, rate-limited above.
     *   HAVE_METADATA            the scrub engine's business, not this one's:
     *                            it seeks the frame out — see scrubEngine.
     */
    const warm = (i: number) => {
      const el = videoRefs.current[i];
      if (!el) return;
      if (el.preload !== "auto") {
        el.preload = "auto";
        if (el.readyState === 0) el.load();
        return;
      }
      if (el.error) {
        // A track that failed ON ITS LOCAL COPY goes back to the network file
        // and takes the local copies off the table for every track: a media
        // pipeline that refuses one blob: source refuses them all, and the
        // film must not be worse off for having tried. Playwright's WebKit on
        // Windows (Media Foundation) does exactly this; iOS does not.
        if (adopted[i]) {
          abandonLocal();
          return;
        }
        const now = performance.now();
        if (now - lastReloadAt[i] < RELOAD_INTERVAL_MS) return;
        lastReloadAt[i] = now;
        el.load();
        return;
      }
      if (el.readyState === 0 && el.networkState === 1) engines[i]?.prime();
    };

    /** blob: URL of each track once its bytes are in, null until then. */
    const localUrls: (string | null)[] = MOBILE_SEGMENTS.map(() => null);
    /** True once the element has been pointed at its local copy. */
    const adopted: boolean[] = MOBILE_SEGMENTS.map(() => false);
    /** True once the element has been pointed at its network file instead. */
    const onNetwork: boolean[] = MOBILE_SEGMENTS.map(() => SAVE_DATA);
    /** Set when a local copy errored: no further swaps, see `abandonLocal`. */
    let localRefused = false;
    /** What the bar last showed, so a tick that changes nothing writes nothing. */
    let barShown = false;
    let barScale = "0";
    /**
     * When each track's pipeline was last pre-rolled (see engine.preroll), 0
     * for never. Done once a track holds a decodable frame, and again on the
     * way into the lead window before its boundary if that was a while ago —
     * a phone under memory pressure may have let an idle pipeline go.
     */
    const prerolledAt: number[] = MOBILE_SEGMENTS.map(() => 0);
    const PREROLL_STALE_MS = 10000;
    /** Fetch progress per track, 0..1, for the bar and the readout. */
    const download: number[] = MOBILE_SEGMENTS.map(() => 0);
    const aborter = new AbortController();

    /** The old path, per track: stream the file from the network. */
    const useNetwork = (i: number) => {
      const el = videoRefs.current[i];
      if (!el || (onNetwork[i] && !adopted[i])) return;
      onNetwork[i] = true;
      adopted[i] = false;
      prerolledAt[i] = 0;
      el.src = MOBILE_SEGMENTS[i].mobileSrc;
      el.preload = "auto";
      el.load();
    };

    /** A blob: source was refused: every track goes to the network, once. */
    const abandonLocal = () => {
      localRefused = true;
      aborter.abort();
      for (let i = 0; i < MOBILE_SEGMENTS.length; i++) useNetwork(i);
    };

    /** Seconds of footage buffered past the playhead, or 0. */
    const bufferedAhead = (el: HTMLVideoElement) => {
      for (let r = 0; r < el.buffered.length; r++) {
        if (el.currentTime >= el.buffered.start(r) && el.currentTime <= el.buffered.end(r)) {
          return el.buffered.end(r) - el.currentTime;
        }
      }
      return 0;
    };

    const prefetch = async () => {
      for (const i of PREFETCH_ORDER) {
        if (aborter.signal.aborted) return;
        try {
          const res = await fetch(MOBILE_SEGMENTS[i].mobileSrc, { signal: aborter.signal });
          if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
          const total = Number(res.headers.get("content-length")) || 0;
          const reader = res.body.getReader();
          const chunks: BlobPart[] = [];
          let received = 0;
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
            received += value.byteLength;
            if (total) download[i] = received / total;
          }
          download[i] = 1;
          // The type matters: Safari will not hand a typeless blob to its
          // media pipeline.
          localUrls[i] = URL.createObjectURL(new Blob(chunks, { type: "video/mp4" }));
        } catch {
          if (aborter.signal.aborted) return;
          // Could not be fetched: this track streams instead, as before.
          useNetwork(i);
        }
      }
    };
    if (!SAVE_DATA) void prefetch();

    /**
     * Point every track whose bytes are in at its local copy. The element had
     * no src until now, so there is nothing on it to lose: whatever it shows
     * (scene 01's poster, or nothing) stays until the copy decodes, and the
     * engine seeks the fresh element to its target from memory. Cheap, and
     * called every tick — the swap itself happens once per track.
     */
    const adopt = () => {
      if (localRefused) return;
      for (let i = 0; i < MOBILE_SEGMENTS.length; i++) {
        const url = localUrls[i];
        const el = videoRefs.current[i];
        if (!url || adopted[i] || onNetwork[i] || !el) continue;
        adopted[i] = true;
        prerolledAt[i] = 0;
        el.src = url;
        el.preload = "auto";
        el.load();
      }
    };

    /**
     * Pre-roll a track's pipeline — see engine.preroll for what that buys on
     * iOS. Called every tick; acts once per track, and again if the last
     * pre-roll has gone stale.
     *
     * WHEN, not just whether. A pre-roll is a play() on a hidden element, and
     * on a phone that is a second decoder starting up while the visible one
     * is working — the 02 → 03 cut showed it as a hitch at the end of scene
     * 02, where scene 03's stale refresh landed in the lead window. So a
     * refresh only happens while the visible track is at rest, and a first
     * pre-roll waits for that too unless the track is about to be needed.
     */
    const preroll = (i: number, atRest: boolean, urgent: boolean) => {
      const el = videoRefs.current[i];
      const engine = engines[i];
      if (!el || !engine || el.readyState < 2 || !el.paused) return;
      const now = performance.now();
      const allowed = prerolledAt[i]
        ? atRest && now - prerolledAt[i] > PREROLL_STALE_MS
        : atRest || urgent;
      if (!allowed) return;
      // Only counts once the engine has actually issued the play(); a refusal
      // (pending play, rate limit, Low Power Mode) is asked again next tick.
      if (engine.preroll()) prerolledAt[i] = now;
    };

    /**
     * Walk the hidden tracks to where the next crossing expects them — the
     * last frame for a scene already passed, the first for one still ahead —
     * but only while the visible track is at rest, so the hidden work never
     * competes with the picture. Cheap: one target write per hidden track
     * per idle tick, and the engine idles once it is there.
     */
    const settleHidden = () => {
      for (let j = 0; j < MOBILE_SEGMENTS.length; j++) {
        if (j === active || gate?.to === j || (!adopted[j] && !onNetwork[j])) continue;
        const engine = engines[j];
        if (!engine) continue;
        engine.setTarget(frameToMediaTime(j < active ? MOBILE_SEGMENTS[j].frames - 1 : 0));
        engine.seedVelocity(0);
      }
    };

    /**
     * Write the stack's opacities: the active track at full, everything else
     * hidden, except during a seam dissolve where the outgoing track is still
     * underneath.
     *
     * Which of the two carries the alpha is decided by DOM order, not by which
     * is arriving: these are stacked elements, so the LATER one paints on top
     * and is the only one whose opacity the eye can see change. Travelling
     * forward that is the incoming track, which fades up; travelling backwards
     * it is the outgoing one, which fades down. Fading the wrong one would
     * simply do nothing, which is the sort of bug that looks like the dissolve
     * "not working" on one scroll direction only.
     */
    const paint = (i: number, under: number, alpha: number) => {
      videoRefs.current.forEach((el, j) => {
        if (!el) return;
        if (under < 0) {
          el.style.opacity = j === i ? "1" : "0";
          return;
        }
        const top = Math.max(i, under);
        if (j === i) el.style.opacity = i === top ? String(alpha) : "1";
        else if (j === under) el.style.opacity = under === top ? String(1 - alpha) : "1";
        else el.style.opacity = "0";
      });
    };

    /**
     * Decide and write this frame's opacities, dissolve included.
     *
     * Both the crossing and the steady state come through here, and they have
     * to: the crossing lands INSIDE the dissolve window, so a hard paint there
     * would show the incoming scene whole for one tick before the fade started
     * — a flash of exactly the cut the dissolve exists to remove.
     *
     * `force` is what keeps the steady state cheap. Opacity is only rewritten
     * while the dissolve is actually changing, or once on the way out of one;
     * holding a scene does not need four style writes sixty times a second.
     */
    const paintFor = (i: number, target: number, force = false) => {
      let under = -1;
      let alpha = 1;
      const fade = SEAM_FADE_FRAMES[i];
      if (seamOn && SEAM_AT.has(i) && fade) {
        const into = target - MOBILE_SEGMENT_START_FRAME[i];
        if (into >= 0 && into < fade) {
          const prev = i - 1;
          const prevEl = prev >= 0 ? videoRefs.current[prev] : null;
          /**
           * Only dissolve from a track that genuinely handed over — one
           * parked on its own last frame. Arrive here by a jump instead and
           * the previous element is sitting on unrelated footage, where
           * fading from it is worse than the cut it replaces.
           */
          if (
            prevEl &&
            prevEl.readyState >= 2 &&
            prevEl.currentTime >= frameToMediaTime(MOBILE_SEGMENTS[prev].frames - 1) - fade / FPS
          ) {
            under = prev;
            alpha = smoothstep((into + 1) / (fade + 1));
          }
        }
      }
      if (under >= 0) {
        paint(i, under, alpha);
        dissolving = true;
      } else if (dissolving || force) {
        paint(i, -1, 1);
        dissolving = false;
      }
    };

    const show = (i: number, target: number) => {
      /**
       * Carry the outgoing engine's velocity into the incoming one.
       *
       * Each scene owns its engine, so without this the new one starts at
       * zero and the rate loses its feed-forward term for the ~170 ms it
       * takes to rebuild — a sag in the picture at exactly the moment a scene
       * begins, which is felt as a hitch at the join rather than as a wrong
       * frame. Seeded here, the incoming scene picks up at the speed the
       * outgoing one was running.
       */
      const from = engines[active];
      const to = engines[i];
      if (from && to && i !== active) {
        to.seedVelocity(from.velocity());
        // A refusal collected while hidden must not decide how the track
        // starts on screen — see engine.retryPlay.
        to.retryPlay();
        /**
         * And PARK the outgoing one — stop it where it is, this tick.
         *
         * Its target stops being written the moment it leaves the screen, so
         * its velocity estimate would otherwise stay frozen at whatever the
         * scroll was doing at the cut — "advancing", for ever — and an engine
         * that believes it is advancing keeps a hidden track in the play
         * path: past its last frame, into `ended`, and around a play/seek
         * loop. Zeroing the velocity fixed that, but still let the track play
         * on to its last frame under the incoming scene — two decoders busy
         * at the one moment the new scene is starting, which is the hitch the
         * 02 → 03 cut showed. So: pause now, wherever it is. Nobody sees a
         * parked frame at a hard cut, and `settleHidden` walks it to its last
         * frame later, at a moment the visible track is at rest.
         */
        from.park();
      }
      active = i;
      gate = null;
      paintFor(i, target, true);
    };

    const drive = (_time: number, deltaMs: number) => {
      // The pin has ended but the gesture that carried the visitor out of it
      // has not: keep governing until the finger is up and the backlog is
      // drained, then hand the scroll back to the page. See onToggle.
      if (!journeyActive && observer?.isEnabled && !observer.isPressed && Math.abs(backlog) < 1) {
        observer.disable();
        release();
        backlog = 0;
      }
      // Release whatever the gesture asked for, at the governed rate.
      // A finger held still on the screen holds the film — see GOVERNOR_STILL_MS.
      const fingerStill =
        !!observer?.isPressed && performance.now() - lastTouchMoveAt > GOVERNOR_STILL_MS;
      if (observer?.isEnabled && backlog !== 0 && !fingerStill) {
        const cap = backlogCap();
        if (Math.abs(backlog) > cap) backlog = Math.sign(backlog) * cap;
        const step = Math.sign(backlog) * Math.min(Math.abs(backlog), (governorRate() * deltaMs) / 1000);
        backlog -= step;
        // Under a pixel is beneath what a scroll call can express. The
        // remainder is carried into the next tick rather than handed back to
        // the backlog: with the tapered tail the last pixels release slowly,
        // and handing them back would never let them go.
        carry += step;
        const move = Math.trunc(carry);
        carry -= move;
        if (Math.abs(backlog) < 0.5) backlog = 0;
        if (move !== 0) {
          /**
           * `behavior: "instant"` is load-bearing, and CanvasNarrative paid for
           * this lesson already: the base stylesheet sets `scroll-behavior:
           * smooth` on <html> for anchor links, so a bare scroll call inherits
           * it and every one of these sixty-per-second calls starts a NEW
           * smooth animation, cancelling the last before it has travelled.
           * Measured there at ~200 px/s delivered against a 1395 px/s budget.
           */
          const before = window.scrollY;
          const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
          const want = Math.min(Math.max(before + move, 0), maxScroll);
          window.scrollTo({ top: want, behavior: "instant" });
          releasedSinceCheck += Math.abs(want - before);
          releasedTotal += Math.abs(want - before);
        }
      }
      // Does the page follow the governor's writes? See GOVERNOR_STUCK_WINDOW_MS
      // for why this is judged per second and not per tick.
      if (journeyActive && observer && !governorFailed) {
        const now = performance.now();
        if (!lastStuckCheckAt) {
          lastStuckCheckAt = now;
          scrollAtCheck = window.scrollY;
        } else if (now - lastStuckCheckAt >= GOVERNOR_STUCK_WINDOW_MS) {
          const moved = Math.abs(window.scrollY - scrollAtCheck);
          landedTotal += moved;
          const stuck =
            releasedSinceCheck >= GOVERNOR_STUCK_MIN_RELEASE_PX &&
            moved < releasedSinceCheck * GOVERNOR_STUCK_LANDED_SHARE;
          stuckWindows = stuck ? stuckWindows + 1 : 0;
          if (stuckWindows >= GOVERNOR_STUCK_WINDOWS) {
            governorFailed = true;
            observer.kill();
            release();
            backlog = 0;
          }
          releasedSinceCheck = 0;
          scrollAtCheck = window.scrollY;
          lastStuckCheckAt = now;
        }
      }
      // iOS reports TouchEvent.clientY wildly wrong at a scroll of exactly 0
      // (normalizeScroll works around the same bug); one pixel in is invisible
      // and keeps the gesture measurable.
      if (journeyActive && observer && !governorFailed && isWebKitTouch && window.scrollY < 1) {
        window.scrollTo({ top: 1, behavior: "instant" });
      }

      // The film-level limiter: the shown frame follows the wanted one at no
      // more than the top of the band, whatever the scroll did — see
      // FILM_LAG_CAP_S. `?governor=off` switches this off with the rest.
      const wanted = targetFrameRef.current;
      if (deltaMs > 0) {
        const instant = ((wanted - wantedPrev) * 1000) / deltaMs;
        wantedFps = wantedFps * 0.7 + instant * 0.3;
      }
      wantedPrev = wanted;
      if (governorOff || Math.abs(wantedFps) > FILM_SNAP_FPS) shownFrame = wanted;
      else {
        // Far behind, catch up at the engine's ceiling; otherwise the band.
        // Never a jump — see FILM_CATCH_UP_LAG_S.
        const lag = Math.abs(wanted - shownFrame);
        const rate = lag > FILM_CATCH_UP_LAG_S * FPS ? rateCeiling() : governorMaxRate;
        const maxStep = (rate * FPS * deltaMs) / 1000;
        if (wanted > shownFrame) shownFrame = Math.min(wanted, shownFrame + maxStep);
        else if (wanted < shownFrame) shownFrame = Math.max(wanted, shownFrame - maxStep);
      }
      const target = shownFrame;
      // The words follow the picture, not the scroll: the hero fades as the
      // film starts moving and the closing rises only once the film has
      // actually arrived. Past the last frame the scroll timeline takes over,
      // because the closing finishes inside the settle runway beyond the film.
      if (storyTl) {
        const filmDone = shownFrame >= MOBILE_GLOBAL_FRAMES - 1.5;
        const storySeconds = (shownFrame / (MOBILE_GLOBAL_FRAMES - 1)) * MOBILE_GLOBAL_DURATION;
        storyTl.time(filmDone ? Math.max(storySeconds, scrollTl?.time() ?? 0) : storySeconds, true);
      }
      const { index, local } = locate(Math.floor(target));
      // Keep the fractional part: the engine quantizes to whole frames itself,
      // and handing it the rounded value first would quantize twice.
      const fraction = target - Math.floor(target);
      const seconds = frameToMediaTime(Math.min(local + fraction, MOBILE_SEGMENTS[index].frames - 1));

      engines[index]?.setTarget(seconds);

      adopt();
      // The bar under the hero: how much of the scene the film needs next has
      // arrived. Only shown while a track is actually being waited for.
      const waiting = !adopted[index] && !onNetwork[index];
      const bar = loadBarRef.current;
      if (bar) {
        if (waiting !== barShown) {
          barShown = waiting;
          bar.style.opacity = waiting ? "1" : "0";
        }
        const scale = waiting ? download[index].toFixed(3) : barScale;
        if (scale !== barScale) {
          barScale = scale;
          bar.style.transform = `scaleX(${scale})`;
        }
      }

      // The next track is warmed from inside the current one, never at the
      // boundary — a fetch started at the moment it is needed is already late.
      // Its pipeline is pre-rolled on the same lead, so the cut lands on a
      // resume rather than a cold start.
      const nextStart = MOBILE_SEGMENT_START_FRAME[index + 1];
      const inLead = nextStart !== undefined && target > nextStart - PRELOAD_LEAD_FRAMES;
      if (inLead) warm(index + 1);
      warm(index);
      // Hidden work — pre-rolls and parked tracks walking to their resting
      // frame — waits for the film to be genuinely at rest: scroll stopped,
      // no lag left to close, visible track idle and paused. The visible
      // track alone is not enough: it idles for a tick in a hold mid-scroll,
      // and for a tick at every cut before the new scene's first play(), and
      // hidden work landing in exactly those ticks was the 02 → 03 hitch.
      // Which tracks the film needs frames from: on screen, arriving, next in
      // line. The rest are left at whatever the browser keeps of them.
      for (let j = 0; j < MOBILE_SEGMENTS.length; j++) {
        engines[j]?.setWanted(
          j === active || j === index || gate?.to === j || (inLead && j === index + 1),
        );
      }
      const activeEl = videoRefs.current[active];
      const atRest =
        Math.abs(wantedFps) < FILM_SETTLED_FPS &&
        Math.abs(wanted - shownFrame) < 1 &&
        index === active &&
        engines[active]?.mode() === "idle" &&
        !!activeEl &&
        activeEl.paused;
      for (let i = 0; i < MOBILE_SEGMENTS.length; i++) {
        if (i !== index) preroll(i, atRest, inLead && i === index + 1);
      }
      if (atRest) settleHidden();

      if (index === active) {
        gate = null;
        // The seam dissolve, driven by scroll POSITION so it plays and
        // reverses with the gesture instead of running on its own clock.
        paintFor(index, target);
        return;
      }

      // A different track owns this frame. Target it while it is still hidden,
      // and hold the outgoing picture until it can actually show the frame.
      const el = videoRefs.current[index];
      warm(index);
      if (!el) return show(index, target);

      const now = performance.now();
      if (!gate || gate.to !== index) gate = { to: index, since: now };

      // Mirrors CanvasNarrative's forced handover: past HANDOVER_MAX_MS the
      // swap stops waiting for an exact frame match, but it still never shows
      // a track that has decoded nothing — readyState < 2 there just holds
      // the outgoing picture one more tick instead of flashing a blank frame.
      const landed = el.readyState >= 2 && Math.abs(el.currentTime - seconds) < HANDOVER_TOL;
      const forced = now - gate.since > HANDOVER_MAX_MS && el.readyState >= 2;
      if (landed || forced) show(index, target);
    };

    gsap.ticker.add(drive);

    /**
     * Diagnostic sampling at 4 Hz — off the per-frame path on purpose, so
     * looking at the readout cannot itself change what is being measured.
     */
    let diagTimer = 0;
    if (diagOn) {
      /**
       * Per-track counters as they stood at each of the last samples, so the
       * readout can show RATES over the last second: frames actually
       * presented (rVFC) and play() calls. Presented frames falling while the
       * target keeps moving is the picture not arriving; play() calls in the
       * double digits is the pipeline being restarted — two different
       * stutters with two different fixes.
       */
      const history: { at: number; presented: number; plays: number }[][] = MOBILE_SEGMENTS.map(
        () => [],
      );
      const perSecond = (i: number, presented: number, plays: number) => {
        const h = history[i];
        const now = performance.now();
        h.push({ at: now, presented, plays });
        while (h.length > 1 && now - h[0].at > 1000) h.shift();
        const dt = (now - h[0].at) / 1000;
        if (dt < 0.4) return { fps: 0, pps: 0 };
        return {
          fps: Math.round((presented - h[0].presented) / dt),
          pps: Math.round((plays - h[0].plays) / dt),
        };
      };
      /**
       * The last DIAG_LOG_SAMPLES readouts, kept so one tap on the panel
       * copies the whole recent history — a scene change and the seconds
       * around it — instead of the single instant a screenshot catches.
       */
      const DIAG_LOG_SAMPLES = 48;
      const log: string[] = [];
      let copiedUntil = 0;
      const panel = diagRef.current;
      if (panel) {
        panel.onclick = () => {
          const text = log.join("\n---\n");
          const done = () => {
            copiedUntil = performance.now() + 1500;
          };
          if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done, done);
          else done();
        };
      }
      const sample = () => {
        const el = diagRef.current;
        if (!el) return;
        const t = targetFrameRef.current;
        const { index, local } = locate(Math.floor(t));
        const lines: string[] = [];
        lines.push(`scroll ${Math.round(window.scrollY)}  alvo f${t.toFixed(1)}/${MOBILE_GLOBAL_FRAMES - 1}`);
        lines.push(
          `cena ${index + 1} local f${local}  ativa ${active + 1}  gov ${governorOff ? "off" : governorFailed ? "auto-off" : "on"} ` +
            `${governorMinRate.toFixed(2)}-${governorMaxRate.toFixed(2)}x`,
        );
        lines.push(
          `pin ${journeyActive ? "sim" : "nao"}  backlog ${Math.round(backlog)}px ` +
            `(${(Math.abs(backlog) / pxPerStorySecond()).toFixed(2)}s) taxa ${(governorRate() / pxPerStorySecond()).toFixed(2)}x`,
        );
        // Whether the gesture reaches the governor and whether the page obeys
        // it: touch deltas received, scroll it released, scroll observed over
        // the same windows, and how many windows in a row looked stuck.
        lines.push(
          `toques ${touchEvents}  liberado ${Math.round(releasedTotal)}px  pousou ${Math.round(landedTotal)}px  ` +
            `stuck ${stuckWindows}  filme f${shownFrame.toFixed(1)} atraso ${((t - shownFrame) / FPS).toFixed(2)}s`,
        );
        // Background fetch per track: percent in, and L once the element has
        // been switched to its local copy.
        lines.push(
          `download ${SAVE_DATA ? "off (data saver)" : localRefused ? "local recusado" : ""} ` +
            MOBILE_SEGMENTS.map(
              (_, i) =>
                `${i + 1}:${Math.round(download[i] * 100)}%${adopted[i] ? "L" : onNetwork[i] ? "N" : ""}`,
            ).join(" "),
        );
        videoRefs.current.forEach((v, i) => {
          if (!v) return;
          const e = engines[i];
          const err = v.error ? `ERRO${v.error.code}` : "-";
          const st = e?.stats();
          // How much of the file has arrived, in seconds of footage past the
          // playhead — the number that separates "iOS will not fetch" from
          // "the network has not delivered yet".
          const ahead = bufferedAhead(v);
          const buffered = ahead > 0 ? ahead.toFixed(1) + "s" : "-";
          const rate = perSecond(i, st?.presentedFrames ?? 0, st?.playCalls ?? 0);
          lines.push(
            `v${i + 1}${adopted[i] ? "L" : onNetwork[i] ? "N" : ""} rs${v.readyState} ns${v.networkState} pre${v.preload.charAt(0)} buf${buffered} ` +
              `t${v.currentTime.toFixed(2)} ${v.paused ? "pause" : "play"} r${v.playbackRate.toFixed(2)} ` +
              `${e?.mode() ?? "-"} fps${rate.fps} pp${rate.pps} pc${st?.playCalls ?? 0} rw${st?.rateWrites ?? 0} rej${st?.playRejects ?? 0} pr${st?.primes ?? 0} ` +
              `sk${st?.seeksCompleted ?? 0}/${st?.avgSeekMs ?? 0}ms to${st?.seekTimeouts ?? 0} ${err}`,
          );
        });
        const anyRej = engines.find((e) => (e?.stats().playRejects ?? 0) > 0);
        if (anyRej) lines.push(`ULTIMO ERRO DE PLAY: ${anyRej.stats().lastPlayError}`);
        const text = lines.join(String.fromCharCode(10));
        log.push(`${new Date().toISOString().slice(11, 23)}\n${text}`);
        if (log.length > DIAG_LOG_SAMPLES) log.shift();
        const hint =
          performance.now() < copiedUntil
            ? "COPIADO — cole no chat"
            : "toque aqui para copiar os ultimos 12 s";
        el.textContent = `${hint}\n${text}`;
      };
      sample();
      diagTimer = window.setInterval(sample, 250);
    }

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        defaults: { ease: "none" },
        scrollTrigger: {
          trigger: section,
          start: "top top",
          end: () =>
            `+=${Math.round(total * (MOBILE_SCROLL_VH_PER_SECOND / 100) * window.innerHeight)}`,
          pin: true,
          // pinType is deliberately LEFT ALONE, which resolves to position:
          // fixed for a viewport scroller — the same thing desktop pins with.
          //
          // This carried `pinType: "transform"` for one round, on the theory
          // that a fixed element would fight the collapsing URL bar. It made
          // the pin visibly shudder on every downward swipe, and the mechanism
          // is worth writing down because the theory sounded reasonable:
          // touch scrolling is driven by the compositor, while a counter
          // translation can only be written from the main thread, so the pinned
          // frame travels with the finger for a frame and is yanked back on the
          // next one. position:fixed never moves in the first place, so there is
          // nothing to correct and nothing to see.
          //
          // Both halves of the original worry were also unfounded. The section
          // is sized in svh — the SMALL viewport height — so it measures the
          // same whether the URL bar is showing or not, and ScrollTrigger
          // already discards the resize events a mobile URL bar fires
          // (_ignoreMobileResize, set from its own touch detection).
          scrub: SCRUB,
          anticipatePin: 1,
          invalidateOnRefresh: true,
          // Same position in the document as the desktop journey, and the same
          // obligation to everything under it — see scrollOrder.
          refreshPriority: REFRESH_JOURNEY,
          // The governor may only intercept while the film owns the screen.
          // Anywhere else the gesture stays native, and the backlog is dropped
          // on the way out so leaving the section never coasts.
          onToggle: (self) => {
            journeyActive = self.isActive;
            if (self.isActive && observer && !governorFailed) {
              claim();
              observer.enable();
            } else if (!observer || (!observer.isPressed && Math.abs(backlog) < 1)) {
              observer?.disable();
              release();
              backlog = 0;
            }
            // Otherwise the finger is still down, or a fling is still being
            // released: the gesture stays governed past the pin's end and
            // `drive` hands the scroll back once it has settled. Letting go
            // mid-gesture is a page that stops dead under the finger — iOS
            // decided at the touch's start that this gesture was not a native
            // scroll, and nothing changes its mind until the next touch.
          },
        },
      });
      tl.to({}, { duration: total }, 0);
      scrollTl = tl;

      tl.eventCallback("onUpdate", () => {
        const t = tl.time();
        targetFrameRef.current = Math.max(
          0,
          Math.min(MOBILE_GLOBAL_FRAMES - 1, (t / MOBILE_GLOBAL_DURATION) * (MOBILE_GLOBAL_FRAMES - 1)),
        );
      });

      /**
       * The words, on a timeline the FILM drives rather than the scroll.
       * Same tweens at the same story times as before; `drive` sets its time
       * from the shown frame every tick. The scroll timeline above keeps only
       * the pin and the wanted frame.
       */
      const words = gsap.timeline({ paused: true, defaults: { ease: "none" } });
      words.to({}, { duration: total }, 0);
      storyTl = words;

      if (heroRef.current) {
        words.to(heroRef.current, { opacity: 0, y: -28, duration: 1.1, ease: "power1.in" }, 0.9);
        words.set(heroRef.current, { pointerEvents: "none" }, 1.4);
      }

      if (closing && closingRef.current) {
        if (scrimRef.current) {
          words.fromTo(
            scrimRef.current,
            { opacity: 0 },
            { opacity: 1, duration: 1 },
            MOBILE_GLOBAL_DURATION - 0.5,
          );
        }
        words.set(closingRef.current, { pointerEvents: "auto" }, MOBILE_GLOBAL_DURATION);
        words.fromTo(
          closingRef.current,
          { opacity: 0, y: 24 },
          { opacity: 1, y: 0, duration: 1, ease: "power2.out" },
          MOBILE_GLOBAL_DURATION - 0.1,
        );
      }
    }, section);

    // The pin is measured against a viewport a phone changes by scrolling, so
    // the first measurement is taken before the address bar has settled.
    ScrollTrigger.refresh();
    const settleTimer = window.setTimeout(() => ScrollTrigger.refresh(), 250);

    return () => {
      if (diagTimer) window.clearInterval(diagTimer);
      window.clearTimeout(settleTimer);
      gsap.ticker.remove(drive);
      gsap.ticker.remove(measureRefresh);
      // Kill, not disable: a live Observer left behind would keep swallowing
      // touchmove on a page that no longer has a film to govern.
      observer?.kill();
      engines.forEach((e) => e?.destroy());
      aborter.abort();
      localUrls.forEach((u) => u && URL.revokeObjectURL(u));
      ctx.revert();
    };
    // Built once. `closing` and `hero` are JSX, so they are a new object on
    // every render of the page above — listing them would tear the pin down and
    // rebuild it mid-scroll for a value the effect only ever reads as truthy.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * lvh for the frame, svh for the copy — the two are not the same question.
   *
   * A phone's address bar retracts as you scroll, and the viewport grows by its
   * height when it does. Sized in svh the pinned frame is the height of the
   * SMALL viewport, so the moment the bar goes away it is 60-90 px short and the
   * page's own black shows through underneath it. lvh is the height with the bar
   * hidden, so the picture always reaches the bottom edge; when the bar is
   * showing the surplus is simply behind it, and object-cover has been cropping
   * this footage all along.
   *
   * lvh keeps what svh was chosen for here. Both are constants — only dvh tracks
   * the bar live — so the pin still measures the same value on every refresh and
   * ScrollTrigger has nothing to thrash against.
   *
   * The copy cannot follow the frame out there, though: anything anchored to the
   * bottom of an lvh box sits behind the address bar whenever it is showing. So
   * the captions, the hero and the closing get their own svh layer, which is the
   * part of the screen that is visible in every state. The scrim is not in it —
   * it belongs to the picture and has to reach the same bottom edge.
   */
  return (
    <section
      ref={sectionRef}
      id={id}
      className="relative h-[100lvh] w-full overflow-hidden bg-sonare-black"
    >
      {/* Four forward tracks, stacked. Opacity is written imperatively by the
          handover, so a scene change costs no React render. The poster carries
          the opening frame until scene 01 has one of its own — without it the
          hero opens on the section's own black. */}
      <div className={`overflow-hidden bg-sonare-black ${VIDEO_BOX}`}>
        {MOBILE_SEGMENTS.map((seg, i) => (
          <video
            key={seg.id}
            ref={(el) => {
              videoRefs.current[i] = el;
            }}
            // No src until the file's bytes are local — see LOCAL COPIES.
            // Data Saver is the one case that streams from the start.
            src={SAVE_DATA ? seg.mobileSrc : undefined}
            poster={i === 0 ? MOBILE_POSTER : undefined}
            muted
            playsInline
            preload={i === 0 ? "auto" : "none"}
            aria-hidden="true"
            tabIndex={-1}
            disablePictureInPicture
            className="pointer-events-none absolute inset-0 h-full w-full object-cover"
            style={{ opacity: i === 0 ? 1 : 0 }}
          />
        ))}
      </div>

      {closing && (
        <div
          ref={scrimRef}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-20 bg-black/45 opacity-0"
        />
      )}

      {/* Everything with words in it. In full-bleed it lies over the picture,
          bounded by the always-visible height; in the framed modes it owns the
          screen below the picture instead, which is the whole point of giving
          the height back.

          pointer-events are off on the layer and switched back on per child, so
          this box cannot swallow a tap meant for the page — the hero already
          hands its own back to the timeline at 1.4s. */}
      <div className={`pointer-events-none ${COPY_BOX}`}>
        {hero && (
          <div ref={heroRef} className="pointer-events-auto absolute inset-0">
            {hero}
          </div>
        )}

        {/* How much of the scene the film is waiting for has arrived. Written
            by `drive`; invisible whenever nothing is being waited for. */}
        <div
          ref={loadBarRef}
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 h-0.5 origin-left bg-sonare-gold/80 opacity-0 transition-opacity duration-500"
          style={{ transform: "scaleX(0)" }}
        />


        {closing && (
          <div
            ref={closingRef}
            className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center opacity-0"
          >
            {closing}
          </div>
        )}
      </div>
      {diagOn &&
        createPortal(
          <pre
            ref={diagRef}
            // Tappable: one tap copies the recent readout history to the
            // clipboard — see the diag block in the effect. Portalled to
            // <body>: inside the pinned section it sits in that section's
            // stacking context, under the navbar, and a tap lands on the logo.
            // Below the navbar (h-16), so the logo and the menu stay tappable
            // while diagnosing.
            className="pointer-events-auto fixed left-0 top-16 z-[1000] m-0 max-w-full cursor-pointer whitespace-pre-wrap bg-black/80 p-1.5 font-mono text-[9px] leading-[1.35] text-lime-300"
          />,
          document.body,
        )}
    </section>
  );
}
