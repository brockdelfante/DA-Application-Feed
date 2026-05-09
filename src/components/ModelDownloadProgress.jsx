/**
 * Small corner progress bar that shows AI model download status.
 * Non-blocking — stays in the corner of the screen.
 */
export default function ModelDownloadProgress({ status }) {
  const { loading, ready, progress, message } = status;

  if (ready) {
    return (
      <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2
                      bg-dark-700/90 border border-accent-green/30 rounded-xl px-3 py-2
                      text-xs text-accent-green backdrop-blur-sm shadow-lg">
        <span className="w-2 h-2 rounded-full bg-accent-green animate-pulse" />
        AI Models Ready
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
        <div
          className="progress-fill"
          style={{ width: `${progress}%` }}
        />
      </div>
      <p className="text-xs text-white/40 mt-1.5 truncate">{message}</p>
    </div>
  );
}
