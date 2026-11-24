/**
 * Session audio « playback » (point 5 : son en arrière-plan, revisitée le
 * 23/11 pour cohabiter avec la musique de l'utilisateur).
 *
 * Principe : une PPA installée (iOS 16.4+) continue de tourner en
 * arrière-plan tant qu'elle lit du son, comme une musique. On lit donc en
 * boucle un WAV de silence NUMÉRIQUE VRAI, inaudible, depuis le geste
 * Start (déblocage iOS : lecture non muted lancée d'un clic, l'élément
 * reste ensuite rejouable sans geste).
 *
 * Cohabitation avec la musique (bugs du 23/11, arbitrage Wandrille du
 * 24/11 : la voix a la priorité sur la musique pendant les séances) :
 * - Au PREMIER PLAN, la boucle est TOUJOURS en pause : revenir sur l'appli
 *   ne réveille jamais la session de lecture. Les annonces TTS prennent
 *   seules une session exclusive à chaque utterance (iOS) : chaque annonce
 *   coupe la musique, c'est le comportement choisi.
 * - En ARRIÈRE-PLAN pendant une séance AVEC voix : la boucle (re)part et,
 *   si une autre source audio (Spotify…) prend le relais, on re-réclame
 *   la session peu après (claim retardé, un par interruption) : la voix
 *   reste vivante, la musique externe est coupée. Pendant une séance, le
 *   timer garde la priorité sur toute autre lecture.
 * - En ARRIÈRE-PLAN pendant une séance SANS voix (réglage coupé) : au
 *   contraire on ne re-réclame JAMAIS derrière elle : sa musique gagne,
 *   le timer reste exact (timestamps) et la session audio ne sert à rien.
 * - Les bips Web Audio passent en session mixable
 *   (`navigator.audioSession.type = 'transient'`, Safari 16.4+) : ils
 *   cohabitent avec la musique au lieu de la couper.
 * - Limite iOS irréductible : le TTS (`speechSynthesis`) prend une
 *   session audio exclusive, il ne peut PAS mixer avec la musique (il la
 *   coupe, cf. choix du 24/11). Et après un arrière-plan interrompu, la
 *   file TTS d'iOS reste parfois muette : VoiceService.rewarm() la
 *   réveille au retour au premier plan (App.tsx).
 */

const WAV_SAMPLE_RATE = 8000;
const WAV_SECONDS = 0.5;
const WAV_SAMPLES = (WAV_SAMPLE_RATE * WAV_SECONDS) | 0;

/**
 * Silence numérique vrai : en PCM 8 bits, les échantillons sont NON
 * SIGNÉS et le silence vaut 128 (0x80). Des zéros (bug du 23/11) = valeur
 * -128 = signal constant PLEINE ÉCHELLE NÉGATIVE : invalide, il claquait
 * à chaque couture de boucle sur iPhone (bruit en boucle dès le début de
 * séance, qui s'emballe à la pause).
 */
export function buildSilentWav(): Uint8Array {
  const bytes = new Uint8Array(44 + WAV_SAMPLES);
  const dv = new DataView(bytes.buffer);
  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) dv.setUint8(offset + i, text.charCodeAt(i));
  };
  ascii(0, 'RIFF');
  dv.setUint32(4, 36 + WAV_SAMPLES, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  dv.setUint32(16, 16, true); // taille du bloc fmt
  dv.setUint16(20, 1, true); // PCM
  dv.setUint16(22, 1, true); // mono
  dv.setUint32(24, WAV_SAMPLE_RATE, true);
  dv.setUint32(28, WAV_SAMPLE_RATE, true); // byte rate (mono 8 bits)
  dv.setUint16(32, 1, true); // alignement
  dv.setUint16(34, 8, true); // bits par échantillon
  ascii(36, 'data');
  dv.setUint32(40, WAV_SAMPLES, true);
  bytes.fill(0x80, 44); // silence : 128 partout, PAS 0
  return bytes;
}

let cachedDataUri: string | null = null;

/** URI data du WAV silencieux (construit une seule fois, jamais de requête réseau). */
export function silentWavDataUri(): string {
  if (cachedDataUri) return cachedDataUri;
  const bytes = buildSilentWav();
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  cachedDataUri = 'data:audio/wav;base64,' + btoa(binary);
  return cachedDataUri;
}

/**
 * Élément audio minimal portant la boucle. Interface volontairement
 * étroite (injection pour les tests ; <audio> en production), distincte de
 * BeepService : ici c'est un état de lecture continu, pas un fond sonore.
 */
export interface LoopAudio {
  loop: boolean;
  volume: number;
  paused: boolean;
  play(): Promise<void>;
  pause(): void;
  setAttribute(name: string, value: string): void;
  addPauseListener(listener: () => void): void;
}

export interface BackgroundAudioDeps {
  createAudio?: () => LoopAudio | null;
  isVisible?: () => boolean;
  /** Type de session navigateur ('auto' | 'transient'...), absent hors Safari 16.4+. */
  setAudioSessionType?: (type: string) => void;
  /** mediaSession : absent hors navigateurs récents. */
  setMediaSession?: (state: 'playing' | 'paused' | 'none', title: string) => void;
  /** Délai de re-claim derrière une interruption externe (test : 1 ms). */
  reclaimDelayMs?: number;
}

/** Options du démarrage de séance. */
export interface BackgroundAudioStartOptions {
  /** Voix active : l'appli re-réclame la session derrière une musique externe (priorité voix, choix du 24/11). */
  voice?: boolean;
}

const createHtmlAudioLoop = (): LoopAudio | null => {
  if (typeof Audio === 'undefined') return null;
  const a = new Audio(silentWavDataUri());
  const listeners: (() => void)[] = [];
  a.addEventListener('pause', () => listeners.forEach((f) => f()));
  return {
    get loop() {
      return true;
    },
    get volume() {
      return a.volume;
    },
    set volume(v) {
      a.volume = v;
    },
    get paused() {
      return a.paused;
    },
    play: () => {
      // HTMLMediaElement.play (Promise sur Safari moderne, undefined ailleurs)
      const p = a.play() as unknown as Promise<void> | undefined;
      return p ?? Promise.resolve();
    },
    pause: () => a.pause(),
    setAttribute: (name, value) => a.setAttribute(name, value),
    addPauseListener: (listener) => listeners.push(listener),
  };
};

/**
 * Machine à états de la session de lecture. Volontairement sans réglage :
 * le comportement est déterministe (premier plan = silence de session,
 * arrière-plan = claim SAUF si une autre source audio a pris le relais).
 */
export class BackgroundAudio {
  private audio: LoopAudio | null = null;
  /** Séance en cours (entre Start et fin/Sortie). */
  private active = false;
  /** Une autre source audio (Spotify…) a interrompu notre lecture. */
  private externalAudio = false;
  /** Pause volontaire (les pauses OS, elles, marquent externalAudio). */
  private selfPause = false;
  /**
   * Priorité voix (choix du 24/11) : si vrai, une interruption externe en
   * arrière-plan déclenche un re-claim de la session (la musique externe
   * est coupée, les annonces vivent). Si faux, la musique externe gagne.
   */
  private voiceEnabled = true;
  /** Re-claim retardé derrière une interruption (un seul par interruption). */
  private reclaimTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly reclaimDelayMs: number;
  private title = '';
  private readonly isVisible: () => boolean;
  private readonly setAudioSessionType: (type: string) => void;
  private readonly setMediaSession: (state: 'playing' | 'paused' | 'none', title: string) => void;
  private readonly createAudio: () => LoopAudio | null;

  constructor(deps: BackgroundAudioDeps = {}) {
    this.createAudio = deps.createAudio ?? createHtmlAudioLoop;
    this.reclaimDelayMs = deps.reclaimDelayMs ?? 1000;
    this.isVisible =
      deps.isVisible ??
      (() => (typeof document !== 'undefined' ? document.visibilityState !== 'hidden' : true));
    this.setAudioSessionType =
      deps.setAudioSessionType ??
      ((type) => {
        try {
          const s = (navigator as unknown as { audioSession?: { type?: string } }).audioSession;
          if (s) s.type = type;
        } catch {
          // silencieux : bonus mixage propre à Safari 16.4+
        }
      });
    this.setMediaSession =
      deps.setMediaSession ??
      ((state, mediaTitle) => {
        try {
          if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
          if (state === 'playing') {
            navigator.mediaSession.metadata = new MediaMetadata({
              title: 'HIIT Timer',
              artist: mediaTitle,
            });
          }
          navigator.mediaSession.playbackState = state;
        } catch {
          // silencieux : la session de fond est un bonus, pas une dépendance
        }
      });
  }

  /**
   * Démarre l'état de séance (idempotent). Doit suivre un clic : la
   * lecture de déblocage part du geste Start, puis rend immédiatement la
   * session si l'appli est au premier plan.
   */
  start(title: string, options: BackgroundAudioStartOptions = {}): void {
    const audio = this.audio ?? this.createAudio();
    if (!audio) return;
    if (!this.audio) {
      audio.setAttribute('playsinline', 'true');
      audio.setAttribute('webkit-playsinline', 'true');
      audio.volume = 0.01; // pas « muted » : une lecture muette ne compte pas
      audio.addPauseListener(() => {
        if (!this.selfPause) {
          this.externalAudio = true;
          this.scheduleReclaim();
        }
      });
      this.audio = audio;
    }
    this.active = true;
    this.externalAudio = false;
    this.voiceEnabled = options.voice ?? true;
    this.title = title;
    this.clearReclaimTimer();
    // Déblocage iOS : rejouable sans geste ensuite. L'élément « béni » est
    // immédiatement remis en pause si l'appli est visible.
    this.selfPause = false;
    void audio
      .play()
      .then(() => {
        if (!this.active || !this.audio) return;
        if (this.isVisible()) this.suspendLoop();
        else this.claimBackground();
      })
      .catch(() => {
        // lecture refusée : l'appli vit quand même au premier plan
      });
  }

  /**
   * Priorité voix changée en cours de séance (réglage). Sans voix, on ne
   * vole jamais la session à une musique externe.
   */
  setVoiceEnabled(voice: boolean): void {
    this.voiceEnabled = voice;
    if (!voice) this.clearReclaimTimer();
  }

  /** Termine l'état de séance (fin de séance ou sortie). */
  stop(): void {
    this.active = false;
    this.clearReclaimTimer();
    this.suspendLoop();
    this.setMediaSession('none', '');
  }

  /** À brancher sur visibilitychange pendant une séance (no-op sinon). */
  onAppVisibility(visible: boolean): void {
    if (!this.active || !this.audio) return;
    if (visible) {
      this.clearReclaimTimer();
      this.suspendLoop();
    } else {
      // Priorité voix : on reprend la session même derrière une musique
      // externe (elle sera coupée). Sans voix : la musique externe gagne.
      if (this.voiceEnabled || !this.externalAudio) this.claimBackground(this.voiceEnabled);
    }
  }

  /** Premier plan : boucle coupée, session mixable pour les bips. */
  private suspendLoop(): void {
    if (this.audio && !this.audio.paused) {
      this.selfPause = true;
      try {
        this.audio.pause();
      } catch {
        // silencieux
      } finally {
        this.selfPause = false;
      }
      this.setMediaSession('paused', this.title);
    }
    this.setAudioSessionType('transient');
  }

  /**
   * Arrière-plan : (re)prise de la session de lecture pour rester vivant.
   * `force` : on prend la session même si une autre source l'a volée
   * (priorité voix du 24/11 : sa musique est coupée).
   */
  private claimBackground(force = false): void {
    if (!this.audio || !this.audio.paused) return;
    if (!force && this.externalAudio) return;
    this.setAudioSessionType('auto');
    this.selfPause = false;
    void this.audio.play().catch(() => {
      // claim refusé (politique de lecture) : le prochain événement de
      // pause externe ou de passage en arrière-plan re-essaiera
    });
    this.setMediaSession('playing', this.title);
  }

  /**
   * Re-claim retardé derrière une interruption externe : un seul essai par
   * interruption (chaque « play » de l'utilisateur dans l'app musicale
   * déclenche le suivant). Sans voix ou au premier plan : jamais.
   */
  private scheduleReclaim(): void {
    if (!this.active || !this.voiceEnabled || this.isVisible()) return;
    this.clearReclaimTimer();
    this.reclaimTimer = setTimeout(() => {
      this.reclaimTimer = null;
      if (!this.active || !this.voiceEnabled) return;
      this.claimBackground(true);
    }, this.reclaimDelayMs);
  }

  private clearReclaimTimer(): void {
    if (this.reclaimTimer !== null) {
      clearTimeout(this.reclaimTimer);
      this.reclaimTimer = null;
    }
  }
}
