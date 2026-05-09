import { useState } from 'react';
import { buildExportZIP, encodeWAV, encodeMP3 } from '../utils/exportUtils.js';

export default function ExportButton({ fullMixData, stems, originalFileData, sampleRate, genre, bpm, key: targetKey }) {
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);

  const disabled = !fullMixData || exporting;

  async function handleExport() {
    if (!fullMixData) return;
    setExporting(true);
    setProgress(0);

    try {
      setProgress(20);
      const wavBuffer = encodeWAV(fullMixData, sampleRate);

      setProgress(50);
      let mp3Data = null;
      try {
        mp3Data = await encodeMP3(fullMixData, sampleRate);
      } catch (_) {
        // MP3 encoding optional — include WAV only if it fails
      }

      setProgress(70);
      const stemObjects = (stems ?? []).map(s => ({
        section: s.section,
        wavData: s.wavData instanceof ArrayBuffer ? s.wavData : encodeWAV(s.audio ?? new Float32Array(0), sampleRate)
      }));

      const metadata = {
        genre,
        bpm,
        key: targetKey,
        exportedAt: new Date().toISOString(),
        sections: stems?.map(s => s.section) ?? []
      };

      setProgress(85);
      const zipBlob = await buildExportZIP(
        originalFileData,
        { wav: wavBuffer, mp3: mp3Data },
        stemObjects,
        metadata
      );

      setProgress(100);

      // Trigger download
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `vocal-restructured-${genre.toLowerCase()}-${bpm}bpm.zip`;
      a.click();
      URL.revokeObjectURL(url);

    } catch (err) {
      console.error('Export failed:', err);
      alert(`Export failed: ${err.message}`);
    } finally {
      setExporting(false);
      setProgress(0);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        className="btn-primary w-full flex items-center justify-center gap-2"
        onClick={handleExport}
        disabled={disabled}
        aria-label="Export as ZIP"
      >
        {exporting ? (
          <>
            <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Exporting… {progress}%
          </>
        ) : (
          <>
            <span>📦</span>
            Export ZIP
          </>
        )}
      </button>
      {exporting && (
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${progress}%` }} />
        </div>
      )}
      <p className="text-xs text-white/30 text-center">
        Includes original, full mix (MP3 + WAV), and individual stems
      </p>
    </div>
  );
}
