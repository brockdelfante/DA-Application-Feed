import { useState, useRef, useCallback } from 'react';

export default function UploadArea({ onFileSelected, disabled }) {
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState(null);
  const inputRef = useRef(null);

  const handleFile = useCallback((file) => {
    if (!file) return;
    if (!file.type.startsWith('audio/') && !file.name.endsWith('.mp3')) {
      alert('Please upload an MP3 audio file.');
      return;
    }
    setFileName(file.name);
    onFileSelected(file);
  }, [onFileSelected]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    handleFile(file);
  }, [handleFile]);

  const handleDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = () => setIsDragging(false);
  const handleInputChange = (e) => handleFile(e.target.files[0]);
  const handleClick = () => !disabled && inputRef.current?.click();

  return (
    <div
      className={`relative border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer
                  transition-all duration-200 select-none
                  ${isDragging
                    ? 'border-accent-purple bg-accent-purple/10'
                    : fileName
                      ? 'border-accent-green/50 bg-accent-green/5'
                      : 'border-white/20 bg-white/5 hover:border-white/40 hover:bg-white/10'}
                  ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onClick={handleClick}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label="Upload vocal MP3 file"
      onKeyDown={(e) => e.key === 'Enter' && handleClick()}
    >
      <input
        ref={inputRef}
        type="file"
        accept="audio/*,.mp3"
        className="hidden"
        onChange={handleInputChange}
        disabled={disabled}
      />

      {fileName ? (
        <>
          <div className="text-4xl mb-3">🎵</div>
          <p className="text-accent-green font-semibold text-sm truncate max-w-xs mx-auto">{fileName}</p>
          <p className="text-white/40 text-xs mt-1">Click or drag to replace</p>
        </>
      ) : (
        <>
          <div className="text-4xl mb-3 opacity-50">🎤</div>
          <p className="text-white/80 font-medium">Drop your vocal MP3 here</p>
          <p className="text-white/40 text-sm mt-1">or click to browse</p>
          <p className="text-white/20 text-xs mt-3">Vocals only — no stem splitting needed</p>
        </>
      )}
    </div>
  );
}
