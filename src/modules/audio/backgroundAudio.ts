/**
 * Session audio « playback » (point 5 : son en arrière-plan, spec du 20/11).
 *
 * Une web app de l'écran d'accueil (iOS 16.4+) continue de tourner tant
 * qu'elle lit du son, comme une musique : du clic Start à la fin de la
 * séance, on lit en boucle un WAV silencieux, inaudible. Le <audio> NE doit
 * PAS être muted (iOS ignore les lectures muettes pour la session de
 * fond) et la lecture doit partir d'un geste utilisateur (Start), comme
 * le débroquage TTS/AudioContext.
 *
 * Effet attendu : timer, bips (Web Audio) et annonces TTS restent vivants
 * en arrière-plan. Si le TTS reste coupé par l'OS malgré tout (à tester
 * sur iPhone réel), repli prévu : bips en arrière-plan + voix au retour ;
 * voix garantie partout = appli native un jour.
 */

const WAV_SAMPLE_RATE = 8000;
const WAV_SECONDS = 0.5;
const WAV_SAMPLES = (WAV_SAMPLE_RATE * WAV_SECONDS) | 0;

/** WAV mono 8 bits de silence total : 44 octets d'en-tête + échantillons à 0. */
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
  // échantillons laissés à zéro : silence
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
 * Boucle silencieuse qui porte la session de lecture. Volontairement
 * distincte de BeepService : les bips sont du fond sonore ponctuel, ici
 * c'est un état de lecture continu, visible par l'OS, qui garde l'appli
 * vivante en arrière-plan.
 */
export class BackgroundAudio {
  private audio: HTMLAudioElement | null = null;
  private started = false;

  /** Démarre la session de lecture (idempotent). Doit suivre un clic. */
  start(title: string): void {
    try {
      if (typeof Audio === 'undefined') return;
      if (!this.audio) {
        const a = new Audio(silentWavDataUri());
        a.loop = true;
        // lecture inline iOS (attribut non typé par lib.dom, d'où setAttribute)
        a.setAttribute('playsinline', 'true');
        a.setAttribute('webkit-playsinline', 'true');
        a.volume = 0.01; // pas « muted » : une lecture muette ne compte pas
        this.audio = a;
      }
      void this.audio.play().catch(() => {
        // lecture refusée : l'appli vit quand même au premier plan
      });
      this.started = true;
      this.setMediaSession('playing', title);
    } catch {
      // silencieux : la session de fond est un bonus, pas une dépendance
    }
  }

  /** Termine la session de lecture (fin de séance ou sortie). */
  stop(): void {
    try {
      this.audio?.pause();
      this.started = false;
      this.setMediaSession('none', '');
    } catch {
      // silencieux
    }
  }

  get playing(): boolean {
    return this.started;
  }

  /**
   * mediaSession : signale à l'OS « lecture en cours », ce qui aide iOS à
   * traiter l'appli comme un lecteur (état affiché sur l'écran verrouillé).
   */
  private setMediaSession(state: 'playing' | 'none', title: string): void {
    try {
      if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
      if (state === 'playing') {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: 'HIIT Timer',
          artist: title,
        });
      }
      navigator.mediaSession.playbackState = state;
    } catch {
      // silencieux
    }
  }
}
