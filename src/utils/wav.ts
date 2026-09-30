// 16-bit mono PCM chunks -> a WAV file's bytes; the service takes WAV, MP3 or OGG Opus
export function toWav(chunks: ArrayBuffer[], sampleRate: number, channels: number): Uint8Array {
  const size = chunks.reduce((n, c) => n + c.byteLength, 0);
  const out = new Uint8Array(44 + size);
  const v = new DataView(out.buffer);
  const ascii = (at: number, s: string) => [...s].forEach((ch, i) => v.setUint8(at + i, ch.charCodeAt(0)));
  ascii(0, 'RIFF');
  v.setUint32(4, 36 + size, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, channels, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * channels * 2, true);
  v.setUint16(32, channels * 2, true);
  v.setUint16(34, 16, true);
  ascii(36, 'data');
  v.setUint32(40, size, true);
  let at = 44;
  for (const c of chunks) {
    out.set(new Uint8Array(c), at);
    at += c.byteLength;
  }
  return out;
}

// Loudness of the loudest 50 ms stretch of 16-bit PCM, as RMS from 0 to 1
export function speechLevel(chunks: ArrayBuffer[], sampleRate: number): number {
  const window = Math.max(1, Math.round(sampleRate / 20));
  let best = 0;
  let sum = 0;
  let n = 0;
  for (const c of chunks) {
    for (const x of new Int16Array(c, 0, c.byteLength >> 1)) {
      sum += x * x;
      if (++n === window) {
        best = Math.max(best, sum / n);
        sum = 0;
        n = 0;
      }
    }
  }
  if (n) best = Math.max(best, sum / n);
  return Math.sqrt(best) / 32768;
}
