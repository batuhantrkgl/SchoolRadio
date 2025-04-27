import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import { getServerStartTime, resetRadioState, getRadioState } from './services/radioService';
import { fetchPlaylistItems } from './services/youtubeService';

// Initialize server start time when the application first loads
// This ensures we have a timestamp for synchronizing playback
getServerStartTime();

// Force refresh playlist on every application restart
const refreshPlaylistOnStartup = async () => {
  console.log("Application startup: Checking playlist");
  
  // Check if a radio state already exists
  const existingState = await getRadioState();
  
  // Only reset radio state if there isn't one already
  // This way new clients will sync with existing playback instead of resetting it
  if (!existingState) {
    console.log("No existing radio state found - creating fresh playlist");
    await resetRadioState();
  } else {
    console.log("Existing radio state found - syncing with current playback");
  }
  
  // Pre-fetch playlist to warm up the cache
  const YOUTUBE_API_KEY = process.env.REACT_APP_YOUTUBE_API_KEY;
  const PLAYLIST_ID = process.env.REACT_APP_PLAYLIST_ID;
  
  if (YOUTUBE_API_KEY && PLAYLIST_ID) {
    try {
      // Add a small delay to ensure Firebase is properly initialized
      // This helps prevent "No radio state found in timer" errors
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Pre-fetch playlist after we've determined state handling
      await fetchPlaylistItems(YOUTUBE_API_KEY, PLAYLIST_ID);
      console.log("Playlist pre-fetched successfully");
    } catch (error) {
      console.error("Failed to pre-fetch playlist:", error);
    }
  } else {
    console.warn("Missing API key or Playlist ID - skipping playlist pre-fetch");
  }
};

// Execute the refresh but wrap in try/catch for resilience
try {
  refreshPlaylistOnStartup().catch(err => {
    console.error("Error during playlist startup:", err);
  });
} catch (error) {
  console.error("Critical error during application startup:", error);
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  // Removed StrictMode to prevent double render which can cause audio issues
  <App />
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();