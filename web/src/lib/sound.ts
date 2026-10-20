// Alarm chime for countdown thresholds. WebAudio only, no asset, no autoplay.
// ponytail: one shared AudioContext, created lazily on the first user gesture.

const MUTE_KEY = 'pr_muted';
let ctx: AudioContext | null = null;

export function isMuted(): boolean {
  try { return localStorage.getItem(MUTE_KEY) === '1'; } catch { return false; }
}

export function setMuted(muted: boolean) {
  try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch { /* private mode — alarm stays on for the session */ }
}

function context(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  ctx = new Ctor();
  return ctx;
}

/** `calls` ascending beeps. Higher pitch for the overdue alarm. */
export function chime(kind: 'warn' | 'critical' | 'overdue') {
  if (isMuted()) return;
  const audio = context();
  if (!audio) return;
  if (audio.state === 'suspended') void audio.resume();

  const notes = kind === 'overdue' ? [880, 660, 880, 660] : kind === 'critical' ? [987, 987] : [660];
  const start = audio.currentTime;
  notes.forEach((freq, i) => {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    const t = start + i * 0.16;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.16, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    osc.connect(gain).connect(audio.destination);
    osc.start(t);
    osc.stop(t + 0.15);
  });
}
