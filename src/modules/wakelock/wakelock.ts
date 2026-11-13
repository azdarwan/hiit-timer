/** Screen Wake Lock avec repli silencieux si non supporté. */
export class WakeLockManager {
  private lock: { release: () => Promise<void>; released: boolean } | null = null;
  private wanted = false;

  async request(): Promise<void> {
    this.wanted = true;
    try {
      const nav = navigator as Navigator & {
        wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void>; released: boolean }> };
      };
      if (!nav.wakeLock) return;
      if (this.lock && !this.lock.released) return;
      this.lock = await nav.wakeLock.request('screen');
    } catch {
      this.lock = null;
    }
  }

  /** À rappeler sur visibilitychange quand la page redevient visible. */
  reacquire(): void {
    if (this.wanted && document.visibilityState === 'visible') void this.request();
  }

  release(): void {
    this.wanted = false;
    if (this.lock && !this.lock.released) {
      this.lock.release().catch(() => undefined);
    }
    this.lock = null;
  }
}
