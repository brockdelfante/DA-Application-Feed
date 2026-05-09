export default function ModelDownloadProgress({ status }) {
  const { loading, ready, fallback, progress, message } = status;

  if (ready && !fallback) {
    return (
      <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2
                      bg-dark-700/90 border border-accent-green/30 rounded-xl px-3 py-2
                      text-xs text-accent-green backdrop-blur-sm shadow-lg">
        <span className="w-2 h-2 rounded-full bg-accent-green animate-pulse" />
        AI Models Ready
      </div>
    );
  }

  if (ready && fallback) {
    return (
      <div className="fixed bottom-4 right-4 z-50 w-64 bg-dark-700/90 border border-yellow-500/30
                      rounded-xl px-3 py-2 backdrop-blur-sm shadow-lg">
        <div className="flex items-center gap-2 text-xs text-yellow-400 font-medium">
          <span>⚠</span> Fallback Mode
        </div>
        <p className="text-xs text-white/40 mt-1">AI models unavailable — using rule-based processing</p>
      </div>
    );
  }

  if (!loading && !ready) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-56 bg-dark-700/90 border border-white/10
                    rounded-xl p-3 backdrop-blur-sm shadow-lg">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs text-white/70 font-medium">Loading AI Models</span>
        <span className="text-xs text-accent-cyan font-mono">{progress}%</span>
      </div>
      <div className="progress-bar">
        <div className="progress-fill" style={{ width: `${progress}%` }} />
      </div>
      <p className="text-xs text-white/40 mt-1.5 truncate">{message}</p>
    </div>
  );
}
