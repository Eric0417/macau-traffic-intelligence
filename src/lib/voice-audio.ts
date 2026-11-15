export const VOICE_SECONDS = 20;
export const VOICE_SAMPLE_RATE = 16_000;
const WAV_HEADER_BYTES = 44;
export const VOICE_MAX_BYTES = WAV_HEADER_BYTES + VOICE_SECONDS * VOICE_SAMPLE_RATE * 2;

export function encodeVoiceWav(samples: Float32Array): ArrayBuffer {
  const buffer = new ArrayBuffer(WAV_HEADER_BYTES + samples.length * 2);
  const view = new DataView(buffer);
  for (const [offset, tag] of [[0, "RIFF"], [8, "WAVEfmt "], [36, "data"]] as const) {
    for (let i = 0; i < tag.length; i++) view.setUint8(offset + i, tag.charCodeAt(i));
  }
  view.setUint32(4, buffer.byteLength - 8, true);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, VOICE_SAMPLE_RATE, true);
  view.setUint32(28, VOICE_SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const sample = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(WAV_HEADER_BYTES + i * 2, Math.round(sample * (sample < 0 ? 32768 : 32767)), true);
  }
  return buffer;
}

export function isVoiceWav(bytes: Uint8Array): boolean {
  if (bytes.length <= WAV_HEADER_BYTES || bytes.length > VOICE_MAX_BYTES || bytes.length % 2 !== 0) return false;
  const header = new TextDecoder("latin1").decode(bytes.subarray(0, WAV_HEADER_BYTES));
  const wav = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return header.startsWith("RIFF") && header.startsWith("WAVEfmt ", 8) && header.startsWith("data", 36)
    && wav.getUint32(4, true) === bytes.length - 8
    && wav.getUint32(16, true) === 16 && wav.getUint16(20, true) === 1 && wav.getUint16(22, true) === 1
    && wav.getUint32(24, true) === VOICE_SAMPLE_RATE && wav.getUint32(28, true) === VOICE_SAMPLE_RATE * 2
    && wav.getUint16(32, true) === 2 && wav.getUint16(34, true) === 16
    && wav.getUint32(40, true) === bytes.length - WAV_HEADER_BYTES;
}
