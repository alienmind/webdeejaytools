import React from 'react';
import {
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Check,
  CheckSquare,
  Compass,
  Copy,
  GripVertical,
  Music,
  Pause,
  Play,
  Square,
} from 'lucide-react';
import { LocalTrackItem } from '../../../../shared/types.js';
import { api } from '../../../services/api.js';
import { formatBytes, formatDuration } from '../utils.js';

interface TrackTableProps {
  tracks: LocalTrackItem[];
  allFilteredCount: number;
  selectedIds: Set<string>;
  playingTrackId?: string;
  isPlaying: boolean;
  copiedPathId: string | null;
  onToggleTrack: (id: string) => void;
  onToggleSelectAll: () => void;
  onPlay: (track: LocalTrackItem) => void;
  onCopyPath: (filePath: string, id: string) => void;
  onOpenKey: (key?: string) => void;
  onReorder: (fromId: string, toId: string) => void;
}

/**
 * Track list.
 *
 * Two presentations from one data source: a full table from `md` up, and a stacked card list below
 * it. The previous single table relied on horizontal scrolling of twelve columns on a phone, which
 * is not usable.
 *
 * Reordering uses dnd-kit rather than the HTML5 drag-and-drop API. The HTML5 API does not fire on
 * touch devices at all, so reordering was silently absent on mobile; dnd-kit handles pointer,
 * touch, and keyboard with one implementation.
 */
export const TrackTable: React.FC<TrackTableProps> = (props) => {
  const { tracks, onReorder } = props;

  const sensors = useSensors(
    // A small distance threshold keeps a tap-to-select from being read as a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      onReorder(String(active.id), String(over.id));
    }
  };

  const ids = tracks.map((t) => t.id);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis]}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {/* Card list: below md */}
        <ul className="divide-y divide-[#1e293b]/60 md:hidden">
          {tracks.map((track) => (
            <TrackCard key={track.id} track={track} {...props} />
          ))}
          {tracks.length === 0 && (
            <li className="py-12 text-center text-sm text-slate-400">
              No tracks found matching your search criteria.
            </li>
          )}
        </ul>

        {/* Table: md and up */}
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="sticky top-0 z-10 select-none border-b border-[#1e293b] bg-[#090d16]/90 text-[11px] uppercase tracking-wider text-slate-300 backdrop-blur">
              <tr>
                <th scope="col" className="w-8 p-3.5 text-center">
                  <span className="sr-only">Reorder</span>
                </th>
                <th scope="col" className="w-10 p-3.5 text-center">
                  <button
                    onClick={props.onToggleSelectAll}
                    className="text-slate-300 transition-all hover:text-white"
                    aria-label="Toggle selection of all tracks"
                  >
                    {props.selectedIds.size > 0 && props.selectedIds.size === props.allFilteredCount ? (
                      <CheckSquare className="h-4 w-4 text-emerald-400" aria-hidden="true" />
                    ) : props.selectedIds.size > 0 ? (
                      <div className="flex h-4 w-4 items-center justify-center rounded border border-emerald-400 bg-emerald-500/40 text-[10px] font-bold text-white">
                        -
                      </div>
                    ) : (
                      <Square className="h-4 w-4 text-slate-400" aria-hidden="true" />
                    )}
                  </button>
                </th>
                <th scope="col" className="w-14 p-3.5">Cover</th>
                <th scope="col" className="p-3.5">Title &amp; Track</th>
                <th scope="col" className="p-3.5">Artist</th>
                <th scope="col" className="p-3.5">Album / Subfolder</th>
                <th scope="col" className="w-20 p-3.5 text-center">BPM</th>
                <th scope="col" className="w-20 p-3.5 text-center">
                  <button
                    onClick={() => props.onOpenKey(undefined)}
                    className="mx-auto flex items-center justify-center gap-1 transition-colors hover:text-violet-300"
                    aria-label="Open the Camelot wheel"
                  >
                    <span>Key</span>
                    <Compass className="h-3 w-3 text-violet-400 opacity-70" aria-hidden="true" />
                  </button>
                </th>
                <th scope="col" className="w-24 p-3.5">Format</th>
                <th scope="col" className="w-20 p-3.5 text-right">Time</th>
                <th scope="col" className="w-24 p-3.5 text-right">Size</th>
                <th scope="col" className="w-12 p-3.5 text-center">Path</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e293b]/60 font-sans">
              {tracks.length === 0 ? (
                <tr>
                  <td colSpan={12} className="py-12 text-center text-sm text-slate-400">
                    No tracks found matching your search criteria.
                  </td>
                </tr>
              ) : (
                tracks.map((track) => <TrackRow key={track.id} track={track} {...props} />)
              )}
            </tbody>
          </table>
        </div>
      </SortableContext>
    </DndContext>
  );
};

interface RowProps extends TrackTableProps {
  track: LocalTrackItem;
}

const Artwork: React.FC<{
  track: LocalTrackItem;
  isThisPlaying: boolean;
  onPlay: (track: LocalTrackItem) => void;
  size: string;
}> = ({ track, isThisPlaying, onPlay, size }) => (
  <div
    className={`group/art relative ${size} shrink-0 overflow-hidden rounded-lg border border-[#1e293b] bg-[#090d16] shadow-sm`}
  >
    {track.hasArtwork ? (
      <img
        src={api.getArtworkUrl(track.filePath)}
        alt=""
        className="h-full w-full object-cover"
        loading="lazy"
        onError={(e) => {
          (e.target as HTMLElement).style.display = 'none';
        }}
      />
    ) : (
      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900 text-slate-400">
        <Music className="h-4 w-4" aria-hidden="true" />
      </div>
    )}

    <button
      onClick={() => onPlay(track)}
      aria-label={isThisPlaying ? `Pause ${track.title}` : `Play ${track.title}`}
      className={`absolute inset-0 flex items-center justify-center transition-all ${
        isThisPlaying
          ? 'bg-black/60 opacity-100'
          : 'bg-black/50 opacity-0 hover:bg-black/70 group-hover/art:opacity-100 focus-visible:opacity-100'
      }`}
    >
      {isThisPlaying ? (
        <Pause className="h-4 w-4 fill-emerald-400 text-emerald-400" aria-hidden="true" />
      ) : (
        <Play className="ml-0.5 h-4 w-4 fill-white text-white" aria-hidden="true" />
      )}
    </button>
  </div>
);

const TrackRow: React.FC<RowProps> = ({
  track,
  selectedIds,
  playingTrackId,
  isPlaying,
  copiedPathId,
  onToggleTrack,
  onPlay,
  onCopyPath,
  onOpenKey,
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: track.id,
  });

  const isSelected = selectedIds.has(track.id);
  const isThisPlaying = playingTrackId === track.id && isPlaying;

  return (
    <tr
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      onClick={() => onToggleTrack(track.id)}
      className={`group cursor-pointer select-none transition-all ${
        isDragging
          ? 'bg-violet-950/60 opacity-40'
          : isSelected
          ? 'bg-emerald-950/20 hover:bg-emerald-950/30'
          : 'hover:bg-[#161f30]'
      }`}
    >
      <td className="w-8 p-3.5 text-center" onClick={(e) => e.stopPropagation()}>
        <button
          {...attributes}
          {...listeners}
          aria-label={`Reorder ${track.title}`}
          className="cursor-grab text-slate-400 transition-colors hover:text-violet-400 active:cursor-grabbing"
        >
          <GripVertical className="mx-auto h-4 w-4" aria-hidden="true" />
        </button>
      </td>

      <td className="p-3.5 text-center" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={() => onToggleTrack(track.id)}
          role="checkbox"
          aria-checked={isSelected}
          aria-label={`Select ${track.title}`}
          className="text-slate-300 transition-all hover:text-white"
        >
          {isSelected ? (
            <CheckSquare className="h-4 w-4 text-emerald-400" aria-hidden="true" />
          ) : (
            <Square className="h-4 w-4 text-slate-400" aria-hidden="true" />
          )}
        </button>
      </td>

      <td className="p-3.5" onClick={(e) => e.stopPropagation()}>
        <Artwork track={track} isThisPlaying={isThisPlaying} onPlay={onPlay} size="h-10 w-10" />
      </td>

      <td className="p-3.5 font-medium text-white">
        <div className="flex items-center gap-1.5">
          {track.trackNumber && (
            <span className="font-mono text-[10px] text-slate-400">
              {track.trackNumber.toString().padStart(2, '0')}.
            </span>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onPlay(track);
            }}
            aria-label={isThisPlaying ? `Pause ${track.title}` : `Play ${track.title}`}
            className={`shrink-0 rounded-md p-1 transition-all ${
              isThisPlaying
                ? 'bg-emerald-950/60 text-emerald-400'
                : 'text-slate-400 hover:bg-slate-800 hover:text-emerald-400'
            }`}
          >
            {isThisPlaying ? (
              <Pause className="h-3 w-3 fill-emerald-400" aria-hidden="true" />
            ) : (
              <Play className="h-3 w-3" aria-hidden="true" />
            )}
          </button>
          <span
            className={`font-bold transition-colors ${
              isThisPlaying ? 'text-emerald-300' : 'text-slate-100 group-hover:text-emerald-300'
            }`}
          >
            {track.title}
          </span>
        </div>
        {track.year && <span className="font-mono text-[10px] text-slate-400">({track.year})</span>}
      </td>

      <td className="p-3.5">
        <span className="rounded-md border border-cyan-800/40 bg-cyan-950/60 px-2 py-0.5 text-[11px] font-medium text-cyan-300">
          {track.artist}
        </span>
      </td>

      <td
        className="max-w-[180px] truncate p-3.5 text-[11px] text-slate-300"
        title={track.album || track.relativeSubPath}
      >
        <span className="text-slate-200">{track.album || '—'}</span>
        {/[\\/]/.test(track.relativeSubPath) && (
          <p className="truncate font-mono text-[10px] text-slate-400">
            {track.relativeSubPath.split(/[\\/]/).slice(0, -1).join('/')}
          </p>
        )}
      </td>

      <td className="p-3.5 text-center">
        {track.bpm ? (
          <span className="rounded-md border border-amber-800/50 bg-amber-950/70 px-2 py-0.5 font-mono text-[11px] font-bold text-amber-300">
            {track.bpm}
          </span>
        ) : (
          <span className="font-mono text-xs text-slate-500">—</span>
        )}
      </td>

      <td className="p-3.5 text-center" onClick={(e) => e.stopPropagation()}>
        {track.key ? (
          <button
            onClick={() => onOpenKey(track.key)}
            className="rounded-md border border-purple-800/50 bg-purple-950/70 px-2 py-0.5 font-mono text-[11px] font-bold text-purple-300 shadow-sm transition-all hover:border-purple-600 hover:bg-purple-900"
            aria-label={`Key ${track.key}. Open the Camelot wheel.`}
          >
            {track.key}
          </button>
        ) : (
          <span className="font-mono text-xs text-slate-500">—</span>
        )}
      </td>

      <td className="p-3.5">
        <span
          className={`rounded-md border px-2 py-0.5 font-mono text-[10px] font-bold uppercase ${
            track.lossless
              ? 'border-purple-800/60 bg-purple-950/70 text-purple-300'
              : 'border-blue-800/60 bg-blue-950/70 text-blue-300'
          }`}
        >
          {track.extension.toLowerCase().includes('flac')
            ? 'FLAC'
            : `${track.extension.replace('.', '')} ${track.bitrate ? `${track.bitrate}k` : ''}`}
        </span>
      </td>

      <td className="p-3.5 text-right font-mono text-slate-300">{formatDuration(track.durationSec)}</td>
      <td className="p-3.5 text-right font-mono text-slate-300">{formatBytes(track.fileSize)}</td>

      <td className="p-3.5 text-center" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={() => onCopyPath(track.filePath, track.id)}
          aria-label={`Copy file path for ${track.title}`}
          className="rounded-lg p-1.5 text-slate-400 transition-all hover:bg-slate-800 hover:text-cyan-400"
        >
          {copiedPathId === track.id ? (
            <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
          ) : (
            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
          )}
        </button>
      </td>
    </tr>
  );
};

/** Mobile presentation: the same data stacked, with the columns that matter to a DJ kept visible. */
const TrackCard: React.FC<RowProps> = ({
  track,
  selectedIds,
  playingTrackId,
  isPlaying,
  onToggleTrack,
  onPlay,
  onOpenKey,
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: track.id,
  });

  const isSelected = selectedIds.has(track.id);
  const isThisPlaying = playingTrackId === track.id && isPlaying;

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-start gap-3 p-3 ${
        isDragging ? 'bg-violet-950/60 opacity-60' : isSelected ? 'bg-emerald-950/20' : ''
      }`}
    >
      <button
        onClick={() => onToggleTrack(track.id)}
        role="checkbox"
        aria-checked={isSelected}
        aria-label={`Select ${track.title}`}
        className="mt-1 shrink-0 text-slate-300"
      >
        {isSelected ? (
          <CheckSquare className="h-5 w-5 text-emerald-400" aria-hidden="true" />
        ) : (
          <Square className="h-5 w-5 text-slate-400" aria-hidden="true" />
        )}
      </button>

      <Artwork track={track} isThisPlaying={isThisPlaying} onPlay={onPlay} size="h-12 w-12" />

      <div className="min-w-0 flex-1">
        <p className={`truncate text-sm font-bold ${isThisPlaying ? 'text-emerald-300' : 'text-slate-100'}`}>
          {track.title}
        </p>
        <p className="truncate text-xs text-cyan-300">{track.artist}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px]">
          {track.bpm && (
            <span className="rounded border border-amber-800/50 bg-amber-950/70 px-1.5 py-0.5 font-mono font-bold text-amber-300">
              {track.bpm} BPM
            </span>
          )}
          {track.key && (
            <button
              onClick={() => onOpenKey(track.key)}
              className="rounded border border-purple-800/50 bg-purple-950/70 px-1.5 py-0.5 font-mono font-bold text-purple-300"
              aria-label={`Key ${track.key}. Open the Camelot wheel.`}
            >
              {track.key}
            </button>
          )}
          <span
            className={`rounded border px-1.5 py-0.5 font-mono font-bold uppercase ${
              track.lossless
                ? 'border-purple-800/60 bg-purple-950/70 text-purple-300'
                : 'border-blue-800/60 bg-blue-950/70 text-blue-300'
            }`}
          >
            {track.extension.replace('.', '')}
          </span>
          <span className="font-mono text-slate-400">{formatDuration(track.durationSec)}</span>
          <span className="font-mono text-slate-400">{formatBytes(track.fileSize)}</span>
        </div>
      </div>

      <button
        {...attributes}
        {...listeners}
        aria-label={`Reorder ${track.title}`}
        className="mt-1 shrink-0 touch-none p-1 text-slate-400 active:text-violet-400"
      >
        <GripVertical className="h-5 w-5" aria-hidden="true" />
      </button>
    </li>
  );
};
