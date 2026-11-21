import { describe, expect, it } from 'vitest';
import { buildSilentWav, silentWavDataUri } from '../modules/audio/backgroundAudio';

describe('BackgroundAudio (session de lecture arrière-plan)', () => {
  it('construit un WAV mono 8 bits de silence total, décodable', () => {
    const wav = buildSilentWav();
    // entete WAV 44 octets + 4000 echantillons a zero (8000 Hz, 0,5 s)
    expect(wav.length).toBe(44 + 4000);
    expect(String.fromCharCode(...wav.slice(0, 4))).toBe('RIFF');
    expect(String.fromCharCode(...wav.slice(8, 12))).toBe('WAVE');
    expect(String.fromCharCode(...wav.slice(36, 40))).toBe('data');
    // silence : tous les échantillons à zéro (inaudible, mais PAS muted)
    expect(wav.slice(44).every((b) => b === 0)).toBe(true);
  });

  it('expose un URI data base64, sans aucune requête réseau', () => {
    const uri = silentWavDataUri();
    expect(uri.startsWith('data:audio/wav;base64,')).toBe(true);
    expect(uri.length).toBeGreaterThan(5000);
    // décodable : la partie base64 est sur des octets
    const b64 = uri.slice('data:audio/wav;base64,'.length);
    expect(atob(b64).length).toBe(44 + 4000);
  });
});
