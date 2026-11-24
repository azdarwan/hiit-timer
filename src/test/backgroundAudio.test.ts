import { describe, expect, it } from 'vitest';
import {
  buildSilentWav,
  silentWavDataUri,
  BackgroundAudio,
  type LoopAudio,
} from '../modules/audio/backgroundAudio';

/** Élément audio factice : les événements pause sont synchrones, comme sur cible. */
class FakeAudio implements LoopAudio {
  loop = true;
  volume = 1;
  paused = true;
  playCalls = 0;
  pauseCalls = 0;
  private listeners: (() => void)[] = [];

  async play(): Promise<void> {
    this.playCalls++;
    this.paused = false;
  }

  pause(): void {
    if (this.paused) return;
    this.pauseCalls++;
    this.paused = true;
    this.listeners.forEach((f) => f());
  }

  setAttribute(): void {
    // attributs <audio> : sans objet ici
  }

  addPauseListener(listener: () => void): void {
    this.listeners.push(listener);
  }

  /** Simule une interruption OS (Spotify prend la session) : pause non provoquée par nous. */
  interrupt(): void {
    this.paused = true;
    this.listeners.forEach((f) => f());
  }
}

function makeFixture() {
  const audio = new FakeAudio();
  let visible = true;
  const sessionTypes: string[] = [];
  const mediaStates: { state: string; title: string }[] = [];
  const bg = new BackgroundAudio({
    createAudio: () => audio,
    isVisible: () => visible,
    setAudioSessionType: (t) => sessionTypes.push(t),
    setMediaSession: (state, title) => mediaStates.push({ state, title }),
    reclaimDelayMs: 1,
  });
  const flush = () => new Promise((r) => setTimeout(r, 0));
  const advanceReclaim = () => new Promise((r) => setTimeout(r, 10));
  return { audio, bg, flush, advanceReclaim, sessionTypes, mediaStates, setVisible: (v: boolean) => (visible = v) };
}

describe('BackgroundAudio (session de lecture arrière-plan)', () => {
  it('construit un WAV mono 8 bits de silence NUMÉRIQUE VRAI, décodable', () => {
    const wav = buildSilentWav();
    // entete WAV 44 octets + 4000 echantillons (8000 Hz, 0,5 s)
    expect(wav.length).toBe(44 + 4000);
    expect(String.fromCharCode(...wav.slice(0, 4))).toBe('RIFF');
    expect(String.fromCharCode(...wav.slice(8, 12))).toBe('WAVE');
    expect(String.fromCharCode(...wav.slice(36, 40))).toBe('data');
    // silence en PCM 8 bits NON SIGNÉ : 128 partout (des 0 = pleine
    // échelle négative = clics à chaque couture de boucle, bug du 23/11)
    expect(wav.slice(44).every((b) => b === 128)).toBe(true);
  });

  it('expose un URI data base64, sans aucune requête réseau', () => {
    const uri = silentWavDataUri();
    expect(uri.startsWith('data:audio/wav;base64,')).toBe(true);
    expect(uri.length).toBeGreaterThan(5000);
    // décodable : la partie base64 est sur des octets
    const b64 = uri.slice('data:audio/wav;base64,'.length);
    expect(atob(b64).length).toBe(44 + 4000);
  });

  it('premier plan au Start : lecture de déblocage puis pause immédiate, session mixable', async () => {
    const { bg, audio, flush, sessionTypes } = makeFixture();
    bg.start('Séance en cours');
    await flush();
    // la lecture part du geste Start (déblocage iOS)…
    expect(audio.playCalls).toBe(1);
    // …au premier plan, jamais de claim : tout de suite en pause.
    expect(audio.paused).toBe(true);
    expect(sessionTypes).toContain('transient');
  });

  it('arrière-plan : réclame la session ; retour au premier plan : la rend', async () => {
    const f = makeFixture();
    f.bg.start('Séance en cours');
    await f.flush();
    f.setVisible(false);
    f.bg.onAppVisibility(false);
    expect(f.audio.paused).toBe(false); // boucle = on vit en arrière-plan
    expect(f.sessionTypes).toContain('auto');
    f.setVisible(true);
    f.bg.onAppVisibility(true);
    expect(f.audio.paused).toBe(true);
    expect(f.sessionTypes[f.sessionTypes.length - 1]).toBe('transient');
  });

  it('interruption externe AVEC voix (priorité voix, choix du 24/11) : la session est re-réclamée derrière elle', async () => {
    const f = makeFixture();
    f.bg.start('Séance en cours'); // voix activée par défaut
    await f.flush();
    f.setVisible(false);
    f.bg.onAppVisibility(false); // claim arrière-plan normal (point 5)
    const claims = f.audio.playCalls;
    f.audio.interrupt(); // Spotify prend le relais
    await f.advanceReclaim(); // re-claim retardé (1 ms en test)
    expect(f.audio.playCalls).toBe(claims + 1);
    expect(f.audio.paused).toBe(false); // la boucle vit : annonces vivantes, musique coupée
  });

  it('interruption externe SANS voix : on ne re-réclame jamais la session derrière elle', async () => {
    const f = makeFixture();
    f.bg.start('Séance en cours', { voice: false });
    await f.flush();
    f.setVisible(false);
    f.bg.onAppVisibility(false);
    const claims = f.audio.playCalls;
    f.audio.interrupt(); // l'OS nous coupe pour Spotify
    await f.advanceReclaim();
    f.setVisible(true);
    f.bg.onAppVisibility(true); // retour au premier plan : rien à couper
    f.setVisible(false);
    f.bg.onAppVisibility(false); // repart en arrière-plan : PAS de claim
    await f.advanceReclaim();
    expect(f.audio.playCalls).toBe(claims);
    expect(f.audio.paused).toBe(true);
  });

  it('re-claim annulé au retour au premier plan (pas de vol de session derrière un retour rapide)', async () => {
    const f = makeFixture();
    f.bg.start('Séance en cours');
    await f.flush();
    f.setVisible(false);
    f.bg.onAppVisibility(false);
    const claims = f.audio.playCalls;
    f.audio.interrupt();
    f.setVisible(true);
    f.bg.onAppVisibility(true); // le re-claim programmé est annulé
    await f.advanceReclaim();
    expect(f.audio.playCalls).toBe(claims);
    expect(f.audio.paused).toBe(true);
  });

  it('re-claim derrière une interruption au PASSAGE en arrière-plan avec voix (visibilitychange après Spotify)', async () => {
    const f = makeFixture();
    f.bg.start('Séance en cours');
    await f.flush();
    // Spotify joue déjà quand l'appli passe en arrière-plan : le timer
    // reprend quand même la session (priorité voix, choix du 24/11).
    f.audio.interrupt(); // Spotify lance sa lecture pendant qu'on est au premier plan
    f.setVisible(false);
    const claimsBefore = f.audio.playCalls;
    f.bg.onAppVisibility(false);
    expect(f.audio.playCalls).toBe(claimsBefore + 1); // claim forcé
    expect(f.audio.paused).toBe(false);
  });

  it('stop termine la séance : mediaSession none, plus aucune réaction à visibilitychange', async () => {
    const f = makeFixture();
    f.bg.start('Séance en cours');
    await f.flush();
    f.bg.stop();
    expect(f.mediaStates.some((m) => m.state === 'none')).toBe(true);
    f.setVisible(false);
    f.bg.onAppVisibility(false);
    expect(f.audio.playCalls).toBe(1); // seulement le déblocage du Start
  });
});
