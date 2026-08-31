import React from 'react';
import {
  ChevronsLeft,
  ChevronsRight,
  Music,
  Pause,
  Play,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { LocalTrackItem } from '../../../../shared/types.js';
import { api } from '../../../services/api.js';
import { formatDuration } from '../utils.js';

interface AudioPreviewBarProps {
  playingTrack: LocalTrackItem | null;
  isPlaying: boolean;
  playbackTime: number;
  playbackDuration: number;
  volume: number;
  isMuted: boolean;
  handlePrevTrack: () => void;
  handleTogglePlayPause: () => void;
  handleNextTrack: () => void;
  handleSeek: (time: number) => void;
  handleVolumeChange: (vol: number) => void;
  handleToggleMute: () => void;
  handleClosePlayer: () => void;
}

export const AudioPreviewBar: React.FC<AudioPreviewBarProps> = ({
  playingTrack,
  isPlaying,
  playbackTime,
  playbackDuration,
  volume,
  isMuted,
  handlePrevTrack,
  handleTogglePlayPause,
  handleNextTrack,
  handleSeek,
  handleVolumeChange,
  handleToggleMute,
  handleClosePlayer,
}) => {
  if (!playingTrack) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-[#1e293b] bg-[#090d16]/95 p-3 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-2xl backdrop-blur-xl animate-fadeIn sm:px-6">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3">
        {/* Track Info & Artwork */}
        <div className="flex w-full items-center gap-3 md:w-auto md:min-w-[240px]">
          <div className="w-11 h-11 rounded-lg overflow-hidden bg-slate-900 border border-[#1e293b] shrink-0 relative">
            {playingTrack.hasArtwork ? (
              <img
                src={api.getArtworkUrl(playingTrack.filePath)}
                alt={playingTrack.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-slate-500">
                <Music className="w-5 h-5" />
              </div>
            )}
          </div>
          <div className="truncate max-w-[220px]">
            <h4 className="text-xs font-bold text-white truncate">{playingTrack.title}</h4>
            <p className="text-[11px] text-cyan-300 truncate">{playingTrack.artist}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              {playingTrack.bpm && (
                <span className="text-[9px] font-mono font-bold text-amber-400 bg-amber-950/80 px-1 rounded">
                  {playingTrack.bpm} BPM
                </span>
              )}
              {playingTrack.key && (
                <span className="text-[9px] font-mono font-bold text-purple-400 bg-purple-950/80 px-1 rounded">
                  {playingTrack.key}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Central Controls & Progress Bar */}
        <div className="flex-1 max-w-xl w-full flex flex-col items-center gap-1.5">
          <div className="flex items-center gap-3">
            <button
              onClick={handlePrevTrack}
              className="p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
              title="Previous Track"
            >
              <ChevronsLeft className="w-4 h-4" />
            </button>
            <button
              onClick={handleTogglePlayPause}
              className="w-9 h-9 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white flex items-center justify-center shadow-glow-emerald transition-all active:scale-95"
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? <Pause className="w-4 h-4 fill-white" /> : <Play className="w-4 h-4 fill-white ml-0.5" />}
            </button>
            <button
              onClick={handleNextTrack}
              className="p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
              title="Next Track"
            >
              <ChevronsRight className="w-4 h-4" />
            </button>
          </div>

          {/* Scrubbable Progress Bar */}
          <div className="w-full flex items-center gap-2 text-[10px] font-mono text-slate-400">
            <span>{formatDuration(playbackTime)}</span>
            <input
              type="range"
              min={0}
              max={playbackDuration || 100}
              value={playbackTime}
              onChange={(e) => handleSeek(parseFloat(e.target.value))}
              className="flex-1 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
            />
            <span>{formatDuration(playbackDuration)}</span>
          </div>
        </div>

        {/* Volume & Close */}
        <div className="hidden items-center justify-end gap-3 md:flex md:min-w-[200px]">
          <button
            onClick={handleToggleMute}
            className="text-slate-400 hover:text-white transition-all"
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted || volume === 0 ? (
              <VolumeX className="w-4 h-4 text-red-400" />
            ) : (
              <Volume2 className="w-4 h-4 text-slate-300" />
            )}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={isMuted ? 0 : volume}
            onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
            className="w-20 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
          />
          <button
            onClick={handleClosePlayer}
            className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-slate-800 transition-all ml-2"
            title="Close Player"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
