import { useCallback, useEffect, useRef, useState } from 'react';
import { LocalTrackItem } from '../../../shared/types.js';
import { api } from '../../services/api.js';
import { useToast } from '../../components/Toast.js';

/**
 * Audio preview player.
 *
 * Owns the single <audio> element and its transport state. The element is created here rather than
 * rendered into the tree so that navigating between views does not tear down playback mid-track.
 */
export function useAudioPreview(getTrackList: () => LocalTrackItem[]) {
  const toast = useToast();
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [playingTrack, setPlayingTrack] = useState<LocalTrackItem | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackTime, setPlaybackTime] = useState(0);
  const [playbackDuration, setPlaybackDuration] = useState(0);
  const [volume, setVolume] = useState(0.85);
  const [isMuted, setIsMuted] = useState(false);

  useEffect(() => {
    const audio = new Audio();
    audio.preload = 'none';
    audio.volume = 0.85;
    audioRef.current = audio;

    const onTime = () => setPlaybackTime(audio.currentTime);
    const onMeta = () => setPlaybackDuration(audio.duration || 0);
    const onEnd = () => setIsPlaying(false);
    const onError = () => {
      setIsPlaying(false);
      if (audio.src) toast.error('Could not play this file');
    };

    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('loadedmetadata', onMeta);
    audio.addEventListener('ended', onEnd);
    audio.addEventListener('error', onError);

    return () => {
      audio.pause();
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('loadedmetadata', onMeta);
      audio.removeEventListener('ended', onEnd);
      audio.removeEventListener('error', onError);
      audio.src = '';
      audioRef.current = null;
    };
  }, [toast]);

  const play = useCallback(
    (track: LocalTrackItem) => {
      const audio = audioRef.current;
      if (!audio) return;

      if (playingTrack?.id === track.id) {
        if (isPlaying) {
          audio.pause();
          setIsPlaying(false);
        } else {
          void audio.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
        }
        return;
      }

      setPlayingTrack(track);
      setPlaybackTime(0);
      setPlaybackDuration(track.durationSec || 0);
      audio.src = api.getStreamUrl(track.filePath);
      void audio.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    },
    [playingTrack, isPlaying]
  );

  const togglePlayPause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !playingTrack) return;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      void audio.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    }
  }, [playingTrack, isPlaying]);

  const step = useCallback(
    (delta: 1 | -1) => {
      if (!playingTrack) return;
      const list = getTrackList();
      const index = list.findIndex((t) => t.id === playingTrack.id);
      const nextIndex = index + delta;
      if (index === -1 || nextIndex < 0 || nextIndex >= list.length) return;
      play(list[nextIndex]);
    },
    [playingTrack, getTrackList, play]
  );

  const seek = useCallback((newTime: number) => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = newTime;
    setPlaybackTime(newTime);
  }, []);

  const changeVolume = useCallback(
    (newVolume: number) => {
      setVolume(newVolume);
      if (audioRef.current) audioRef.current.volume = newVolume;
      if (newVolume > 0 && isMuted) {
        setIsMuted(false);
        if (audioRef.current) audioRef.current.muted = false;
      }
    },
    [isMuted]
  );

  const toggleMute = useCallback(() => {
    if (!audioRef.current) return;
    const next = !isMuted;
    setIsMuted(next);
    audioRef.current.muted = next;
  }, [isMuted]);

  const close = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
    }
    setPlayingTrack(null);
    setIsPlaying(false);
    setPlaybackTime(0);
  }, []);

  return {
    playingTrack,
    isPlaying,
    playbackTime,
    playbackDuration,
    volume,
    isMuted,
    play,
    togglePlayPause,
    next: () => step(1),
    previous: () => step(-1),
    seek,
    changeVolume,
    toggleMute,
    close,
  };
}
