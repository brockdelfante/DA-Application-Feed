import { GENRES, GENRE_TEMPLATES } from '../utils/genreTemplates.js';

export default function GenreSelector({ value, onChange, disabled }) {
  return (
    <div className="space-y-2">
      <label className="block text-xs font-semibold text-white/60 uppercase tracking-wider">
        Genre
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="input-field w-full"
        aria-label="Select target genre"
      >
        <option value="">— Select Genre —</option>
        {GENRES.map(genre => (
          <option key={genre} value={genre}>{genre}</option>
        ))}
      </select>
      {value && GENRE_TEMPLATES[value] && (
        <p className="text-xs text-white/30">
          Typical BPM: {GENRE_TEMPLATES[value].bpmRange[0]}–{GENRE_TEMPLATES[value].bpmRange[1]}
        </p>
      )}
    </div>
  );
}
