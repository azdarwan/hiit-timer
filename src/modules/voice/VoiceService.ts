import type { Lang } from '../../types';

/**
 * Interface volontairement minimale : remplacer le TTS navigateur par des
 * MP3 enregistrés se fait en écrivant une autre implémentation de cette
 * interface, sans toucher au reste de l'application.
 */
export interface VoiceService {
  /** À appeler depuis un gestionnaire de clic (débloque Safari/iOS). */
  init(): void;
  /**
   * Réveille la synthèse au retour au premier plan : iOS laisse parfois la
   * file TTS muette (bloquée « pending ») après un arrière-plan interrompu
   * par une autre source audio (bug constaté le 24/11 : silence même revenu
   * sur l'appli, pause/play ne réveille rien).
   */
  rewarm(): void;
  setLang(lang: Lang): void;
  setEnabled(enabled: boolean): void;
  speak(text: string): void;
  cancel(): void;
}

/** Voix proposée dans les réglages. */
export interface VoiceOption {
  name: string;
  lang: string;
}

type VoicesListener = () => void;

/**
 * Score de qualité d'une voix pour une langue cible. Le TTS varie beaucoup
 * selon le navigateur/OS : on privilégie les voix "Google", "Natural",
 * "Premium"/"Enhanced" et les voix locales de qualité (ex. Amélie sur iOS)
 * plutôt que la première venue (souvent la mauvaise voix par défaut, cf.
 * irritant voix du backlog).
 */
function scoreVoice(v: SpeechSynthesisVoice, lang: Lang): number {
  const target = lang === 'fr' ? 'fr' : 'en';
  const vlang = v.lang.toLowerCase().replace('_', '-');
  let s = 0;
  if (vlang.startsWith(target)) s += 10;
  if (lang === 'fr' && vlang.startsWith('fr-fr')) s += 4;
  if (lang === 'en' && vlang.startsWith('en-us')) s += 2;
  const n = v.name.toLowerCase();
  if (n.includes('google')) s += 8;
  if (n.includes('natural') || n.includes('premium') || n.includes('enhanced') || n.includes('siri')) s += 6;
  if (lang === 'fr' && (n.includes('amélie') || n.includes('amelie') || n.includes('audrey') || n.includes('thomas'))) s += 5;
  if (v.localService) s += 1;
  return s;
}

export class TtsVoiceService implements VoiceService {
  private enabled = true;
  private lang: Lang = 'fr';
  /** Voix choisie manuellement dans les réglages (null = automatique). */
  private voiceName: string | null = null;
  private voice: SpeechSynthesisVoice | null = null;
  private listeners = new Set<VoicesListener>();

  constructor() {
    // Écoute posée dès la construction : les voix arrivent de façon
    // asynchrone, y compris avant le premier clic sur Start.
    try {
      if (typeof speechSynthesis !== 'undefined') {
        speechSynthesis.addEventListener('voiceschanged', () => {
          this.pickVoice();
          this.listeners.forEach((l) => l());
        });
      }
    } catch {
      // silencieux
    }
  }

  init(): void {
    try {
      if (typeof speechSynthesis === 'undefined') return;
      speechSynthesis.getVoices();
      // Uterence inaudible NON VIDE (bug iOS : une utterance vide peut ne
      // jamais finir et bloquer toute la file derrière elle).
      const u = new SpeechSynthesisUtterance('.');
      u.volume = 0;
      speechSynthesis.speak(u);
      this.pickVoice();
    } catch {
      // silencieux : la voix est optionnelle
    }
  }

  rewarm(): void {
    if (!this.enabled || typeof speechSynthesis === 'undefined') return;
    try {
      // Purge la file, débloque une éventuelle mise en pause interne, puis
      // relance la machine par une utterance inaudible non vide : c'est le
      // seul remède connu au TTS muet d'iOS après un arrière-plan.
      speechSynthesis.cancel();
      speechSynthesis.resume();
      const u = new SpeechSynthesisUtterance('.');
      u.volume = 0;
      speechSynthesis.speak(u);
    } catch {
      // silencieux : la voix est optionnelle
    }
  }

  setLang(lang: Lang): void {
    this.lang = lang;
    this.voice = null;
    this.pickVoice();
  }

  setVoiceName(name: string | null): void {
    this.voiceName = name && name.trim() ? name : null;
    this.voice = null;
    this.pickVoice();
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.cancel();
  }

  /** Liste des voix disponibles pour la langue courante (réglages). */
  listVoices(lang: Lang = this.lang): VoiceOption[] {
    try {
      if (typeof speechSynthesis === 'undefined') return [];
      const target = lang === 'fr' ? 'fr' : 'en';
      return speechSynthesis
        .getVoices()
        .filter((v) => v.lang.toLowerCase().startsWith(target))
        .map((v) => ({ name: v.name, lang: v.lang }))
        .sort((a, b) => a.name.localeCompare(b.name));
    } catch {
      return [];
    }
  }

  onVoicesChanged(listener: VoicesListener): void {
    this.listeners.add(listener);
  }

  offVoicesChanged(listener: VoicesListener): void {
    this.listeners.delete(listener);
  }

  speak(text: string): void {
    if (!this.enabled || typeof speechSynthesis === 'undefined') return;
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = this.lang === 'fr' ? 'fr-FR' : 'en-US';
      if (this.voice) u.voice = this.voice;
      u.rate = 1.1;
      speechSynthesis.speak(u);
    } catch {
      // silencieux
    }
  }

  cancel(): void {
    try {
      speechSynthesis?.cancel();
    } catch {
      // silencieux
    }
  }

  private pickVoice(): void {
    try {
      if (typeof speechSynthesis === 'undefined') {
        this.voice = null;
        return;
      }
      const voices = speechSynthesis.getVoices();
      if (voices.length === 0) return;
      if (this.voiceName) {
        const exact = voices.find((v) => v.name === this.voiceName);
        if (exact) {
          this.voice = exact;
          return;
        }
      }
      const inLang = voices.filter((v) => scoreVoice(v, this.lang) >= 10);
      const pool = inLang.length > 0 ? inLang : voices;
      this.voice = pool.reduce((best, v) => (scoreVoice(v, this.lang) > scoreVoice(best, this.lang) ? v : best));
    } catch {
      this.voice = null;
    }
  }
}
