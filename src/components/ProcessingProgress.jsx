const STAGE_ICONS = {
  TRANSCRIBE: '🎙',
  ANALYSE: '🔍',
  RESTRUCTURE: '🔀',
  EFFECTS: '✨',
  EXPORT: '📦'
};

const STAGE_ORDER = ['TRANSCRIBE', 'ANALYSE', 'RESTRUCTURE', 'EFFECTS', 'EXPORT'];

export default function ProcessingProgress({ stage, overallProgress, message, stageLabel }) {
  if (!stage && overallProgress === 0) return null;

  const currentStageIdx = STAGE_ORDER.indexOf(stage);

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white/80">Processing</h3>
        <span className="text-sm font-mono text-accent-cyan">{overallProgress ?? 0}%</span>
      </div>

      {/* Stage indicators */}
      <div className="flex gap-2">
        {STAGE_ORDER.map((s, idx) => (
          <div
            key={s}
            className={`flex-1 flex flex-col items-center gap-1 transition-all duration-300
              ${idx < currentStageIdx ? 'opacity-40' : idx === currentStageIdx ? 'opacity-100' : 'opacity-20'}`}
          >
            <span className="text-lg">{STAGE_ICONS[s]}</span>
            <div
              className={`h-0.5 w-full rounded-full transition-all duration-500
                ${idx < currentStageIdx ? 'bg-accent-green' : idx === currentStageIdx ? 'bg-accent-purple' : 'bg-white/10'}`}
            />
          </div>
        ))}
      </div>

      {/* Current stage label */}
      {stageLabel && (
        <p className="text-sm text-white/70">{stageLabel}…</p>
      )}

      {/* Overall progress bar */}
      <div className="progress-bar">
        <div
          className="progress-fill"
          style={{ width: `${overallProgress ?? 0}%` }}
        />
      </div>

      {message && (
        <p className="text-xs text-white/40 italic">{message}</p>
      )}
    </div>
  );
}
