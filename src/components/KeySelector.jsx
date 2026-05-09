import { ALL_KEYS } from '../utils/keyDetection.js';

export default function KeySelector({ value, onChange, detectedKey, disabled }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold text-white/60 uppercase tracking-wider">
          Target Key
        </label>
        {detectedKey && (
          <button
            type="button"
            className="text-xs text-accent-cyan hover:text-white transition-colors"
            onClick={() => onChange(detectedKey.label)}
            disabled={disabled}
            title="Use detected key"
          >
            Detected: {detectedKey.label}
          </button>
        )}
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="input-field w-full"
        aria-label="Select target key"
      >
        <option value="">— Select Key —</option>
        {ALL_KEYS.map(key => (
          <option key={key} value={key}>{key}</option>
        ))}
      </select>
      {detectedKey && (
        <p className="text-xs text-white/30">
          Confidence: {Math.round(detectedKey.confidence * 100)}%
        </p>
      )}
    </div>
  );
}
