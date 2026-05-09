/**
 * Export utilities: MP3 (via lamejs), WAV, and ZIP packaging.
 */

/**
 * Encode a Float32Array to WAV format (PCM 16-bit).
 * Returns an ArrayBuffer.
 */
export function encodeWAV(audioData, sampleRate, numChannels = 1) {
  const bytesPerSample = 2; // 16-bit
  const dataLength = audioData.length * bytesPerSample * numChannels;
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);

  const writeString = (offset, str) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);          // PCM chunk size
  view.setUint16(20, 1, true);           // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * bytesPerSample, true); // byte rate
  view.setUint16(32, numChannels * bytesPerSample, true); // block align
  view.setUint16(34, 16, true);          // bits per sample
  writeString(36, 'data');
  view.setUint32(40, dataLength, true);

  let offset = 44;
  for (let i = 0; i < audioData.length; i++) {
    const sample = Math.max(-1, Math.min(1, audioData[i]));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    offset += 2;
  }

  return buffer;
}

/**
 * Encode Float32Array to MP3 using lamejs.
 * Returns Uint8Array of MP3 data.
 * `lamejs` must be imported before calling this.
 */
export async function encodeMP3(audioData, sampleRate, bitrate = 128) {
  // Dynamic import so it doesn't break non-browser environments
  const { Mp3Encoder } = await import('lamejs');
  const encoder = new Mp3Encoder(1, sampleRate, bitrate);

  // lamejs expects Int16Array
  const pcm = new Int16Array(audioData.length);
  for (let i = 0; i < audioData.length; i++) {
    pcm[i] = Math.max(-32768, Math.min(32767,
      audioData[i] < 0 ? audioData[i] * 32768 : audioData[i] * 32767
    ));
  }

  const chunkSize = 1152;
  const mp3Parts = [];

  for (let i = 0; i < pcm.length; i += chunkSize) {
    const chunk = pcm.subarray(i, i + chunkSize);
    const mp3buf = encoder.encodeBuffer(chunk);
    if (mp3buf.length > 0) mp3Parts.push(mp3buf);
  }

  const flush = encoder.flush();
  if (flush.length > 0) mp3Parts.push(flush);

  // Concatenate
  const totalLength = mp3Parts.reduce((acc, b) => acc + b.length, 0);
  const mp3Data = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of mp3Parts) {
    mp3Data.set(part, offset);
    offset += part.length;
  }

  return mp3Data;
}

/**
 * Build a ZIP file containing:
 * - original_vocals.mp3
 * - full_mix.mp3
 * - full_mix.wav
 * - stems/{section}_stem.wav for each stem
 *
 * Returns a Blob.
 */
export async function buildExportZIP(originalAudio, fullMix, stems, metadata) {
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();

  // Original vocals
  if (originalAudio) {
    zip.file('original_vocals.mp3', originalAudio);
  }

  // Full mix — WAV
  if (fullMix?.wav) {
    zip.file('full_mix.wav', fullMix.wav);
  }

  // Full mix — MP3
  if (fullMix?.mp3) {
    zip.file('full_mix.mp3', fullMix.mp3);
  }

  // Individual section stems
  if (stems && stems.length > 0) {
    const stemsFolder = zip.folder('stems');
    const sectionCounts = {};
    for (const stem of stems) {
      const count = sectionCounts[stem.section] ?? 0;
      sectionCounts[stem.section] = count + 1;
      const suffix = count > 0 ? `_${count}` : '';
      const filename = `${stem.section}${suffix}_stem.wav`;
      stemsFolder.file(filename, stem.wavData);
    }
  }

  // Metadata JSON
  if (metadata) {
    zip.file('metadata.json', JSON.stringify(metadata, null, 2));
  }

  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

/**
 * Validate that a WAV buffer has the correct RIFF header.
 */
export function validateWAV(buffer) {
  if (buffer.byteLength < 44) return false;
  const view = new DataView(buffer);
  const riff = String.fromCharCode(
    view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3)
  );
  const wave = String.fromCharCode(
    view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11)
  );
  return riff === 'RIFF' && wave === 'WAVE';
}

/**
 * Validate a basic MP3 buffer — checks for ID3 or sync frame header.
 */
export function validateMP3(data) {
  if (!data || data.length < 4) return false;
  // ID3v2
  if (data[0] === 0x49 && data[1] === 0x44 && data[2] === 0x33) return true;
  // MPEG sync word
  if (data[0] === 0xff && (data[1] & 0xe0) === 0xe0) return true;
  return false;
}

/**
 * Decode an MP3 File/Blob to Float32Array using the Web Audio API.
 * Returns { audioData: Float32Array, sampleRate: number }
 */
export async function decodeAudioFile(file) {
  const arrayBuffer = await file.arrayBuffer();
  const AudioContextClass = globalThis.AudioContext ?? globalThis.webkitAudioContext;
  if (!AudioContextClass) throw new Error('AudioContext not available');

  const ctx = new AudioContextClass();
  try {
    const decoded = await ctx.decodeAudioData(arrayBuffer);
    // Mix down to mono
    const mono = new Float32Array(decoded.length);
    for (let ch = 0; ch < decoded.numberOfChannels; ch++) {
      const channelData = decoded.getChannelData(ch);
      for (let i = 0; i < decoded.length; i++) {
        mono[i] += channelData[i] / decoded.numberOfChannels;
      }
    }
    return { audioData: mono, sampleRate: decoded.sampleRate, duration: decoded.duration };
  } finally {
    await ctx.close();
  }
}

/**
 * Validate that a ZIP blob contains the expected stem files.
 */
export async function validateZIPStructure(zipBlob) {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(zipBlob);
  const files = Object.keys(zip.files);

  const hasFullMixMp3 = files.some(f => f === 'full_mix.mp3');
  const hasFullMixWav = files.some(f => f === 'full_mix.wav');
  const hasStems = files.some(f => f.startsWith('stems/'));

  return {
    valid: hasFullMixMp3 && hasFullMixWav && hasStems,
    files,
    hasFullMixMp3,
    hasFullMixWav,
    hasStems
  };
}
