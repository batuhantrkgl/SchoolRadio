import React, { useEffect, useState } from 'react';
import YouTube from 'react-youtube';
import './Player.css';

const Player = ({ 
  isLoading, 
  error, 
  currentTrack, 
  nextTrack,
  currentTime,
  totalDuration,
  currentPosition,
  playlistName,
  onPlayerReady, 
  onPlayerStateChange,
  onPlayerError, 
  playerOpts
}) => {
  const [windowSize, setWindowSize] = useState({
    width: window.innerWidth,
    height: window.innerHeight
  });
  
  // Calculate progress percentage
  const progressPercentage = totalDuration ? (currentPosition / totalDuration) * 100 : 0;
  
  // Format time to MM:SS
  const formatTime = (seconds) => {
    if (!seconds && seconds !== 0) return '0:00';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds < 10 ? '0' : ''}${remainingSeconds}`;
  };
  
  // Update window size on resize
  useEffect(() => {
    const handleResize = () => {
      setWindowSize({
        width: window.innerWidth,
        height: window.innerHeight
      });
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  if (isLoading) {
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

  if (!currentTrack) {
    return (
      <div className="loading-container">
        <p>No track available</p>
      </div>
    );
  }

  const videoId = currentTrack.snippet.resourceId.videoId;
  const thumbnailUrl = currentTrack.snippet.thumbnails.maxres?.url || 
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
          opts={playerOpts}
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
          <p className="now-playing-text">Now Playing: {currentTrack.snippet.title}</p>
          {nextTrack && (
            <p className="next-up-text">Next Up: {nextTrack.snippet.title}</p>
          )}
          <p className="playlist-text">Playlist: {playlistName || "School Public Playlist"}</p>
        </div>
      </div>
    </div>
  );
};

export default Player;
