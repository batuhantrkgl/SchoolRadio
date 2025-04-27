import React from 'react';
import './PlaylistDisplay.css';

/**
 * Component to display the playlist
 */
const PlaylistDisplay = ({ playlist, currentTrack }) => {
  if (!playlist || playlist.length === 0) {
    return <div className="playlist-container">No tracks available</div>;
  }

  return (
    <div className="playlist-container">
      <h2>Current Playlist</h2>
      <div className="playlist-list">
        {playlist.map((track, index) => (
          <div 
            key={track.snippet.resourceId.videoId} 
            className={`playlist-item ${currentTrack && currentTrack.snippet.resourceId.videoId === track.snippet.resourceId.videoId ? 'current-track' : ''}`}
          >
            <div className="playlist-item-number">{index + 1}</div>
            <div className="playlist-item-thumbnail">
              <img 
                src={track.snippet.thumbnails.default.url} 
                alt={track.snippet.title} 
              />
            </div>
            <div className="playlist-item-info">
              <div className="playlist-item-title">{track.snippet.title}</div>
              <div className="playlist-item-channel">{track.snippet.videoOwnerChannelTitle}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PlaylistDisplay;