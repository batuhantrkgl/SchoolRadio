import React, { useEffect, useState, useRef, useCallback } from "react";
import YouTube from "react-youtube";
import "./Player.css";

const Player = ({
  isLoading,
  error,
  currentTrack,
  nextTrack,
  currentTime,
  totalDuration,
  currentPosition,
  playlistName,
}) => {
  const playerRef = useRef(null);
  const playerErrorCountRef = useRef(0);
  const unmuteRetriesRef = useRef(0);
  const unstartedTimeoutRef = useRef(null);
  const opts = {
    height: "0",
    width: "0",
    playerVars: {
      playsinline: 1, // Allow fullscreen on mobile
      controls: 0, // Hide controls
      fs: 0, // Hide fullscreen button
      disablekb: 1, // Disable keyboard shortcuts
      modestbranding: 1, // Hide YouTube logo
      iv_load_policy: 3, // Hide annotations
      cc_load_policy: 0, // Hide closed captions
      autoplay: 1, // Autoplay
      quality: "small", // Default to small quality
      mute: 1, // Start muted
      origin: window.location.origin, // Set the origin
    },
  };

  // Safe player operations
  const safePlayerPlay = useCallback(() => {
    try {
      playerRef.current?.playVideo();
    } catch (error) {
      // Handle error, maybe log it or show a message to the user
    }
  }, []);

  const safePlayerPause = useCallback(() => {
    try {
      playerRef.current?.pauseVideo();
    } catch (error) {
      // Handle error
    }
  }, []);

  const safePlayerUnMute = useCallback(() => {
    try {
      playerRef.current?.unMute();
      unmuteRetriesRef.current = 0; // Reset retries on success
    } catch (error) {
      if (unmuteRetriesRef.current < 3) {
        console.warn("Failed to unmute player, retrying...");
        unmuteRetriesRef.current++;
        setTimeout(() => {
          safePlayerUnMute();
        }, 1000); // Retry after 1 second
      } else {
        console.error("Failed to unmute player after multiple retries.");
      }
      // Handle error
    }
  }, []);

  const safePlayerSetVolume = useCallback((volume) => {
    try {
      playerRef.current?.setVolume(volume);
    } catch (error) {
      // Handle error
    }
  }, []);

  const optimizeForAudioOnly = useCallback(() => {
    if (playerRef.current) {
      playerRef.current.internalPlayer.setPlaybackQuality("small");
    }
  }, []);

  const onPlayerReady = useCallback(
    (event) => {
      playerRef.current = event.target;
      optimizeForAudioOnly();
      ensureAudio();
    },
    [optimizeForAudioOnly],
  );

  // Ensure playback
  const ensurePlayback = useCallback(
    (state) => {
      switch (state) {
        case 1: // Playing
          safePlayerPlay();
          break;
        case 2: // Paused
          safePlayerPause();
          break;
        default:
          break;
      }
    },
    [safePlayerPlay, safePlayerPause],
  );

  const ensureAudio = useCallback(() => {
    safePlayerUnMute();
    safePlayerSetVolume(100);
  }, [safePlayerUnMute, safePlayerSetVolume]);

  const onPlayerStateChange = useCallback(
    (event) => {
      try {
        const state = event.data;
        ensurePlayback(state);
        if (state === -1) {
          unstartedTimeoutRef.current = setTimeout(() => {
            if (playerRef.current.getPlayerState() === -1) {
              resetYouTubePlayer();
            }
          }, 5000);
        } else {
          clearTimeout(unstartedTimeoutRef.current);
          if (state === 1 || state === 0) {
            ensureAudio();
          }
        }
      } catch (error) {
        // Handle any errors during state change handling
      }
    },
    [ensureAudio, ensurePlayback],
  );

  const onPlayerError = useCallback(
    (event) => {
      playerErrorCountRef.current++;
      if (playerErrorCountRef.current > 2) {
        resetYouTubePlayer();
        playerErrorCountRef.current = 0;
      }
      if (event.data === 101) {
        resetYouTubePlayer();
      }
      if (event.data === 150) {
        console.warn(
          "Error 150: Video is not available for embedding. Skipping to next track.",
        );
        nextTrack();
      } else {
        console.warn("YouTube Player error", event);
      }
    },
    [nextTrack, resetYouTubePlayer],
  );

  const resetYouTubePlayer = useCallback(() => {
    if (playerRef.current) {
      try {
        playerRef.current.stopVideo();
        playerRef.current?.seekTo(0, true);
        safePlayerPlay();
        safePlayerUnMute();
        safePlayerSetVolume(100);
        playerErrorCountRef.current = 0;
      } catch (error) {
        // Handle error when resetting the player
      }
    }
  }, []);

  useEffect(() => {
    optimizeForAudioOnly();
  }, [optimizeForAudioOnly]);

  const [windowSize, setWindowSize] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });

  const handleResize = () => {
    setWindowSize({
      width: window.innerWidth,
      height: window.innerHeight,
    });
  };

  useEffect(() => {
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [window.innerWidth, window.innerHeight]);

  const videoId = currentTrack?.snippet?.resourceId?.videoId;
  const progressPercentage = totalDuration
    ? (currentPosition / totalDuration) * 100
    : 0; // Calculate progress percentage

  // Format time to MM:SS
  const formatTime = (seconds) => {
    if (!seconds && seconds !== 0) return "0:00";
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds < 10 ? "0" : ""}${remainingSeconds}`;
  };

  if (isLoading || !currentTrack) {
    return (
      <div className="loading-container">
        <p>Loading your music...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-container">
        <p className="error">{error}</p>
      </div>
    );
  }

  const thumbnailUrl =
    currentTrack.snippet.thumbnails.maxres?.url ||
    currentTrack.snippet.thumbnails.high?.url ||
    currentTrack.snippet.thumbnails.medium?.url;

  return (
    <div className="player-container">
      {/* Background image using the thumbnail */}
      <div
        className="background-cover"
        style={{ backgroundImage: `url(${thumbnailUrl})` }}
      ></div>
      <div className="background-overlay"></div>

      {/* YouTube player (hidden) */}
      <div className="hidden-player">
        <YouTube
          videoId={videoId}
          opts={{
            ...opts,
          }}
          onReady={onPlayerReady}
          onStateChange={onPlayerStateChange}
          onError={onPlayerError}
        />
      </div>

      {/* Progress bar */}
      <div className="progress-container">
        <div className="time-display">
          <span>{formatTime(currentPosition)}</span>
          <span>{formatTime(totalDuration)}</span>
        </div>
        <div className="progress-bar">
          <div
            className="progress-fill"
            style={{ width: `${progressPercentage}%` }}
          ></div>
        </div>
      </div>
      {/* Now playing info */}
      <div className="now-playing-info">
        <div className="track-info">
          <p className="now-playing-text">
            Now Playing: {currentTrack.snippet.title}
          </p>
          {nextTrack && (
            <p className="next-up-text">Next Up: {nextTrack.snippet.title}</p>
          )}
          <p className="playlist-text">
            Playlist: {playlistName || "School Public Playlist"}
          </p>
        </div>
      </div>
    </div>
  );
};

export default Player;
