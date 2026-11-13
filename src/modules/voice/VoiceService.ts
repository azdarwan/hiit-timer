import type { Lang } from '../../types';

/**
 * Interface volontairement minimale : remplacer le TTS navigateur par des
 * MP3 enregistrés se fait en écrivant une autre implémentation de cette
 * interface, sans toucher au reste de l'application.
 */
export interface VoiceService {
  /** À appeler depuis un gestionnaire de clic (débloque Safari/iOS). */
  init(): void;
  setLang(lang: Lang): void;
  setEnabled(enabled: boolean): void;
  speak(text: string): void;
  cancel(): void;
}

export class TtsVoiceService implements VoiceService {
  private enabled = true;
  private lang: Lang = 'fr';
  private voice: SpeechSynthesisVoice | null = null;

  init(): void {
    try {
      if (typeof speechSynthesis === 'undefined') return;
      speechSynthesis.getVoices();
      // Utérance vide : débloche la synthèse vocale sur iOS au premier geste.
      const u = new SpeechSynthesisUtterance('');
      u.volume = 0;
      speechSynthesis.speak(u);
      speechSynthesis.addEventListener('voiceschanged', () => this.pickVoice());
      this.pickVoice();
    } catch {
      // silencieux : la voix est optionnelle
    }
  }

  setLang(lang: Lang): void {
    this.lang = lang;
    this.voice = null;
    this.pickVoice();
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.cancel();
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
      const voices = speechSynthesis.getVoices();
      const target = this.lang === 'fr' ? 'fr' : 'en';
      this.voice =
        voices.find((v) => v.lang.toLowerCase().startsWith(target)) ?? null;
    } catch {
      this.voice = null;
    }
  }
}
