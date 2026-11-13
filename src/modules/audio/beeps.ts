/** Bips générés par Web Audio, aucun fichier son. */
export class BeepService {
  private ctx: AudioContext | null = null;
  private volume = 0.7;

  /** À appeler depuis un gestionnaire de clic (débloque Safari/iOS). */
  init(): void {
    try {
      if (!this.ctx) {
        const AC =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch {
      // silencieux
    }
  }

  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
  }

  /** Bip de décompte (3, 2, 1). */
  tick(): void {
    this.beep(880, 90);
  }

  /** Signal de transition de phase. */
  transition(): void {
    this.beep(660, 180);
  }

  /** Signal de fin de séance. */
  finish(): void {
    this.beep(523, 250);
    setTimeout(() => this.beep(659, 250), 260);
    setTimeout(() => this.beep(784, 400), 520);
  }

  private beep(freq: number, durationMs: number): void {
    if (!this.ctx || this.volume <= 0) return;
    try {
      const ctx = this.ctx;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t = ctx.currentTime;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(this.volume, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + durationMs / 1000);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + durationMs / 1000 + 0.05);
    } catch {
      // silencieux
    }
  }
}
