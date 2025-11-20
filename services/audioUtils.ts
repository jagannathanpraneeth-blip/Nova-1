import { Blob as GenAIBlob } from "@google/genai";

export const PCM_SAMPLE_RATE_INPUT = 16000;
export const PCM_SAMPLE_RATE_OUTPUT = 24000;

/**
 * Decodes base64 string to raw bytes
 */
export function decode(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Encodes raw bytes to base64 string
 */
export function encode(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Downsamples audio buffer to 16kHz if necessary.
 * This is critical because browsers often ignore AudioContext sampleRate request.
 */
export function downsampleTo16k(buffer: Float32Array, inputSampleRate: number): Float32Array {
  if (inputSampleRate === 16000) {
    return buffer;
  }
  
  const ratio = inputSampleRate / 16000;
  const newLength = Math.ceil(buffer.length / ratio);
  const result = new Float32Array(newLength);
  
  for (let i = 0; i < newLength; i++) {
    // Simple nearest-neighbor is usually sufficient for speech and much faster than FIR filters
    const offset = Math.floor(i * ratio);
    if (offset < buffer.length) {
        result[i] = buffer[offset];
    }
  }
  return result;
}

/**
 * Decodes raw PCM byte array to an AudioBuffer for playback
 */
export async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number
): Promise<AudioBuffer> {
  let pcmData: Int16Array;
  
  // Safety: Int16Array requires byteLength to be a multiple of 2
  if (data.byteLength % 2 !== 0) {
    const newBuffer = new Uint8Array(data.byteLength + 1);
    newBuffer.set(data);
    pcmData = new Int16Array(newBuffer.buffer);
  } else {
    pcmData = new Int16Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
  }

  const frameCount = pcmData.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      // Convert Int16 (-32768 to 32767) to Float32 (-1.0 to 1.0)
      channelData[i] = pcmData[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

/**
 * Converts Float32Array from AudioContext to GenAIBlob (PCM Int16) for the API
 */
export function createBlob(data: Float32Array): GenAIBlob {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    // Clamp and scale to Int16 range
    let s = Math.max(-1, Math.min(1, data[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return {
    data: encode(new Uint8Array(int16.buffer)),
    mimeType: 'audio/pcm;rate=16000',
  };
}