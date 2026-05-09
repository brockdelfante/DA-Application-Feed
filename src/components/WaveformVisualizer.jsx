import { useEffect, useRef } from 'react';

const SECTION_COLORS = {
  intro:        '#6366f1',
  verse:        '#3b82f6',
  'pre-chorus': '#8b5cf6',
  chorus:       '#ec4899',
  drop:         '#ef4444',
  bridge:       '#f97316',
  breakdown:    '#eab308',
  build:        '#f59e0b',
  outro:        '#6b7280'
};

export default function WaveformVisualizer({ audioData, sampleRate, sectionPlan, duration }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !audioData) return;

    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    // Draw waveform
    const step = Math.max(1, Math.floor(audioData.length / W));
    ctx.strokeStyle = 'rgba(99, 102, 241, 0.6)';
    ctx.lineWidth = 1;
    ctx.beginPath();

    for (let x = 0; x < W; x++) {
      const idx = x * step;
      const sample = audioData[idx] ?? 0;
      const y = (1 - sample) * H / 2;
      x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Draw section regions
    if (sectionPlan && duration > 0) {
      for (const section of sectionPlan) {
        const xStart = (section.targetStart / duration) * W;
        const xEnd = (section.targetEnd / duration) * W;
        const color = SECTION_COLORS[section.section] ?? '#7c3aed';

        // Section fill
        ctx.fillStyle = `${color}30`;
        ctx.fillRect(xStart, 0, xEnd - xStart, H);

        // Section border
        ctx.strokeStyle = `${color}80`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(xStart, 0);
        ctx.lineTo(xStart, H);
        ctx.stroke();

        // Section label
        if (xEnd - xStart > 20) {
          ctx.fillStyle = color;
          ctx.font = '10px sans-serif';
          ctx.textAlign = 'center';
          const labelX = xStart + (xEnd - xStart) / 2;
          ctx.fillText(section.section, Math.max(xStart + 20, Math.min(labelX, W - 20)), 14);
        }
      }
    }
  }, [audioData, sampleRate, sectionPlan, duration]);

  if (!audioData) {
    return (
      <div className="card flex items-center justify-center h-24 text-white/20 text-sm">
        Waveform will appear after upload
      </div>
    );
  }

  return (
    <div className="card space-y-3">
      <h3 className="text-sm font-semibold text-white/60 uppercase tracking-wider">
        Waveform &amp; Sections
      </h3>
      <canvas
        ref={canvasRef}
        width={800}
        height={96}
        className="w-full h-24 rounded-lg bg-dark-900"
        aria-label="Waveform visualizer"
      />
      {/* Legend */}
      {sectionPlan && sectionPlan.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {[...new Set(sectionPlan.map(s => s.section))].map(name => (
            <span key={name} className="flex items-center gap-1 text-xs text-white/50">
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: SECTION_COLORS[name] ?? '#7c3aed' }}
              />
              {name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
