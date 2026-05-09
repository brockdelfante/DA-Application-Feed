export default function BPMSlider({ value, onChange, detectedBPM, disabled }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold text-white/60 uppercase tracking-wider">
          Target BPM
        </label>
        <div className="flex items-center gap-2">
          {detectedBPM && (
            <button
              type="button"
              className="text-xs text-accent-cyan hover:text-white transition-colors"
              onClick={() => onChange(detectedBPM)}
              disabled={disabled}
              title="Use detected BPM"
            >
              Detected: {detectedBPM}
            </button>
          )}
          <input
            type="number"
            min={60}
            max={180}
            value={value}
            onChange={(e) => onChange(Math.min(180, Math.max(60, parseInt(e.target.value) || 120)))}
            disabled={disabled}
            className="input-field w-16 text-center text-sm"
            aria-label="BPM value"
          />
        </div>
      </div>
      <input
        type="range"
        min={60}
        max={180}
        step={1}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value))}
        disabled={disabled}
        className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer
                   accent-accent-purple disabled:cursor-not-allowed"
        aria-label="BPM slider"
      />
      <div className="flex justify-between text-xs text-white/20">
        <span>60</span>
        <span>120</span>
        <span>180</span>
      </div>
    </div>
  );
}
