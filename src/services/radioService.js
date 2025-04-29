import { getDatabase, ref, get, set, onValue } from 'firebase/database';
import { app } from './firebaseService';

/**
 * Radio Service - Manages the shared state for synchronized music playback
 */

// Set this to false to reduce console logging
const DEBUG_MODE = false;

// Controls how often regular status logs are shown (in milliseconds)
const LOG_INTERVAL = 30000; // 30 seconds

// Timestamp of last log to enforce interval
let lastLogTimestamp = 0;

// Helper function for conditional logging
const debugLog = (...args) => {
  if (DEBUG_MODE) {
    console.log(...args);
  }
};

// Helper function for interval-based logging
const intervalLog = (...args) => {
  const now = Date.now();
  if (now - lastLogTimestamp >= LOG_INTERVAL) {
    console.log(...args);
    lastLogTimestamp = now;
    return true;
  }
  return false;
};

// Helper function for logging critical events
const criticalLog = (...args) => {
  // Always log critical events
  console.log(...args);
};

// We'll use localStorage to simulate a server-side state
// In a production environment, this would be replaced with a backend service

// Get the database instance
const database = getDatabase(app);

// Get the server start time or set it if it doesn't exist
export const getServerStartTime = async () => {
  try {
    // Reference to the server start time in the database
    const startTimeRef = ref(database, 'radioServerStartTime');

    // Get the current value
    const snapshot = await get(startTimeRef);

    if (snapshot.exists()) {
      // If it exists, return it
      return parseInt(snapshot.val(), 10);
    } else {
      // If it doesn't exist, set it
      const startTime = Date.now();
      await set(startTimeRef, startTime.toString());
      return startTime;
    }
  } catch (error) {
    console.error('Error getting server start time from Firebase:', error);

    // Fallback to localStorage if Firebase fails
    const storedStartTime = localStorage.getItem('radioServerStartTime');
    if (!storedStartTime) {
      const startTime = Date.now();
      localStorage.setItem('radioServerStartTime', startTime.toString());
      return startTime;
    }
    return parseInt(storedStartTime, 10);
  }
};

// Get the current radio state
export const getRadioState = async () => {
  try {
    // Reference to the radio state in the database
    const stateRef = ref(database, 'radioState');

    // Get the current value
    const snapshot = await get(stateRef);

    if (snapshot.exists()) {
      // If it exists, return it
      return snapshot.val();
    } else {
      return null;
    }
  } catch (error) {
    console.error('Error getting radio state from Firebase:', error);

    // Fallback to localStorage if Firebase fails
    const state = localStorage.getItem('radioState');
    // If state exists, return it; otherwise return null
    if (state) {
      try {
        return JSON.parse(state);
      } catch (e) {
        console.error('Error parsing radio state:', e);
        // If there's an error parsing, we'll initialize a new state
        return null;
      }
    }
    return null;
  }
};

// Initialize radio with playlist
export const initializeRadio = async (playlist) => {
  try {
    // Check if we already have state first
    const existingState = await getRadioState();
    if (existingState && existingState.playlist && existingState.playlist.length > 0) {
      // Ensure playedTracks field exists
      if (!existingState.playedTracks) {
        existingState.playedTracks = [];

        // Update in Firebase
        await set(ref(database, 'radioState'), existingState);

        // Also update in localStorage as fallback
        localStorage.setItem('radioState', JSON.stringify(existingState));
      }
      return existingState;
    }

    // Shuffle the playlist once
    const shuffledPlaylist = shuffleArray([...playlist]);

    // Create initial state
    const initialState = {
      playlist: shuffledPlaylist,
      currentTrackIndex: 0,
      startTime: Date.now(),
      isPlaying: true,
      playedTracks: [], // Track which songs have been played in current cycle
      lastFullPlaythrough: Date.now() // When was the last time we played the full playlist
    };

    // Save state to Firebase
    await set(ref(database, 'radioState'), initialState);

    // Also save to localStorage as fallback
    localStorage.setItem('radioState', JSON.stringify(initialState));

    return initialState;
  } catch (error) {
    console.error('Error initializing radio with Firebase:', error);

    // Fallback to localStorage if Firebase fails
    // Check if we already have state first in localStorage
    const localState = localStorage.getItem('radioState');
    if (localState) {
      try {
        const existingState = JSON.parse(localState);
        if (existingState.playlist && existingState.playlist.length > 0) {
          // Ensure playedTracks field exists
          if (!existingState.playedTracks) {
            existingState.playedTracks = [];
            localStorage.setItem('radioState', JSON.stringify(existingState));
          }
          return existingState;
        }
      } catch (e) {
        console.error('Error parsing local radio state:', e);
      }
    }

    // If no valid state in localStorage, create a new one
    const shuffledPlaylist = shuffleArray([...playlist]);
    const initialState = {
      playlist: shuffledPlaylist,
      currentTrackIndex: 0,
      startTime: Date.now(),
      isPlaying: true,
      playedTracks: [],
      lastFullPlaythrough: Date.now()
    };
    localStorage.setItem('radioState', JSON.stringify(initialState));
    return initialState;
  }
};

// Get current track based on sequential playback
export const getCurrentTrack = (state, serverStartTime) => {
  if (!state) return null;

  const { playlist, startTime, playedTracks } = state;
  if (!playlist || playlist.length === 0) return null;

  // Calculate elapsed time since server start
  const now = Date.now();
  const elapsed = now - serverStartTime;

  // Parse ISO 8601 duration format (PT1H2M3S) to seconds
  const parseISODuration = (duration) => {
    if (!duration) return 0;

    // If it's already a number, return it
    if (typeof duration === 'number') return duration;

    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return 0;

    const hours = parseInt(match[1] || 0, 10);
    const minutes = parseInt(match[2] || 0, 10);
    const seconds = parseInt(match[3] || 0, 10);

    return hours * 3600 + minutes * 60 + seconds;
  };

  // Calculate total duration of all tracks in the playlist
  let totalPlaylistDuration = 0;
  let trackDurations = [];

  // Get duration for each track and calculate total
  for (let i = 0; i < playlist.length; i++) {
    const track = playlist[i];
    let trackDuration = 0;

    // If track has contentDetails with duration, use it
    if (track.contentDetails && track.contentDetails.duration) {
      trackDuration = parseISODuration(track.contentDetails.duration) * 1000; // Convert to ms
    } else {
      // Fallback to average duration if not available
      trackDuration = 3 * 60 * 1000; // 3 minutes in milliseconds
    }

    trackDurations[i] = trackDuration;
    totalPlaylistDuration += trackDuration;
  }

  // If totalPlaylistDuration is 0, use a default value to avoid division by zero
  if (totalPlaylistDuration === 0) {
    totalPlaylistDuration = playlist.length * 3 * 60 * 1000; // Default 3 minutes per track
    for (let i = 0; i < playlist.length; i++) {
      trackDurations[i] = 3 * 60 * 1000;
    }
  }

  // Get the current epoch (how many times we've gone through the full playlist)
  const epoch = Math.floor(elapsed / totalPlaylistDuration);

  // Calculate how far we are into the current epoch
  const epochElapsed = elapsed % totalPlaylistDuration;

  // Determine current track index based on actual durations
  let currentIndex = 0;
  let accumulatedDuration = 0;

  for (let i = 0; i < playlist.length; i++) {
    if (accumulatedDuration + trackDurations[i] > epochElapsed) {
      currentIndex = i;
      break;
    }
    accumulatedDuration += trackDurations[i];
  }

  // If we didn't find a track (which shouldn't happen), default to the first track
  if (currentIndex >= playlist.length) {
    currentIndex = 0;
  }

  // Log strict interval (30 seconds) or track change since last interval log
  const trackChanged = state._lastLoggedTrack !== currentIndex;
  const logged = intervalLog(`Radio: Track ${currentIndex+1}/${playlist.length} - "${playlist[currentIndex]?.snippet?.title}"`);

  if (logged) {
    // Update log tracking
    state._lastLoggedTrack = currentIndex;
  } else if (trackChanged && !state._reportedTrackChange) {
    // Only log track changes once, and only if we haven't logged in the last interval
    criticalLog(`Track changed: "${playlist[currentIndex]?.snippet?.title}"`);
    state._reportedTrackChange = true;
    state._lastLoggedTrack = currentIndex;
  } else if (!trackChanged) {
    // Reset track change flag when track is stable
    state._reportedTrackChange = false;
  }

  // Calculate how far into the current song we are
  const currentSongElapsed = epochElapsed - accumulatedDuration;
  const currentSongElapsedSeconds = Math.floor(currentSongElapsed / 1000);

  // Update the played tracks history if needed
  if (!state.playedTracks) {
    // Initialize played tracks if doesn't exist
    state.playedTracks = [currentIndex];
    localStorage.setItem('radioState', JSON.stringify(state));
  } else if (!state.playedTracks.includes(currentIndex)) {
    // Add current track to played tracks if not already there
    state.playedTracks.push(currentIndex);
    localStorage.setItem('radioState', JSON.stringify(state));
  }

  return {
    track: playlist[currentIndex],
    position: currentSongElapsedSeconds,
    index: currentIndex,
    epoch: epoch
  };
};

// Helper function to shuffle array (Fisher-Yates algorithm)
export const shuffleArray = (array) => {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
};

// Check if all tracks have been played and reset history if needed
export const checkAndResetPlayedTracks = async () => {
  try {
    const state = await getRadioState();
    if (!state || !state.playlist || !state.playedTracks) return;

    // If we've played all tracks, reset the played tracks array and shuffle again
    if (state.playedTracks.length >= state.playlist.length) {
      // This is a critical event, always log it
      criticalLog("All tracks have been played, reshuffling playlist");

      // Shuffle the playlist again for the next cycle
      const reshuffledPlaylist = shuffleArray([...state.playlist]);

      // Update state with new shuffled playlist and reset played tracks
      state.playlist = reshuffledPlaylist;
      state.playedTracks = [];
      state.lastFullPlaythrough = Date.now();

      // Save the updated state to Firebase
      await set(ref(database, 'radioState'), state);

      // Also save to localStorage as fallback
      localStorage.setItem('radioState', JSON.stringify(state));
    }
  } catch (error) {
    console.error('Error checking and resetting played tracks in Firebase:', error);

    // Fallback to localStorage if Firebase fails
    try {
      const localState = localStorage.getItem('radioState');
      if (!localState) return;

      const state = JSON.parse(localState);
      if (!state || !state.playlist || !state.playedTracks) return;

      // If we've played all tracks, reset the played tracks array and shuffle again
      if (state.playedTracks.length >= state.playlist.length) {
        // This is a critical event, always log it
        criticalLog("All tracks have been played, reshuffling playlist (localStorage fallback)");

        // Shuffle the playlist again for the next cycle
        const reshuffledPlaylist = shuffleArray([...state.playlist]);

        // Update state with new shuffled playlist and reset played tracks
        state.playlist = reshuffledPlaylist;
        state.playedTracks = [];
        state.lastFullPlaythrough = Date.now();

        // Save the updated state to localStorage
        localStorage.setItem('radioState', JSON.stringify(state));
      }
    } catch (e) {
      console.error('Error checking and resetting played tracks in localStorage:', e);
    }
  }
};

// Get the next track that hasn't been played yet
export const getNextUnplayedTrack = (state) => {
  if (!state || !state.playlist || state.playlist.length === 0) return null;

  // If we don't have playedTracks array, initialize it
  if (!state.playedTracks) {
    state.playedTracks = [];
  }

  // If all tracks have been played, reset
  if (state.playedTracks.length >= state.playlist.length) {
    checkAndResetPlayedTracks();
    return state.playlist[0]; // Return first track of the new shuffled playlist
  }

  // Find the next track that hasn't been played
  for (let i = 0; i < state.playlist.length; i++) {
    if (!state.playedTracks.includes(i)) {
      return state.playlist[i];
    }
  }

  // If all tracks have been played (shouldn't reach here but just in case)
  return state.playlist[0];
};

// Function to completely reset the radio state and force a new playlist fetch
export const resetRadioState = async () => {
  criticalLog("Resetting radio state to fetch fresh playlist");

  try {
    // Remove radio state from Firebase
    await set(ref(database, 'radioState'), null);

    // Reset server start time to now for a completely fresh experience
    const startTime = Date.now();
    await set(ref(database, 'radioServerStartTime'), startTime.toString());

    // Also reset localStorage as fallback
    localStorage.removeItem('radioState');
    localStorage.setItem('radioServerStartTime', startTime.toString());

    return null;
  } catch (error) {
    console.error('Error resetting radio state in Firebase:', error);

    // Fallback to localStorage if Firebase fails
    localStorage.removeItem('radioState');

    // Reset server start time to now for a completely fresh experience
    const startTime = Date.now();
    localStorage.setItem('radioServerStartTime', startTime.toString());

    return null;
  }
};

// Function to update playlist with new items while preserving playback state
export const updatePlaylist = async (newPlaylistItems) => {
  try {
    const state = await getRadioState();
    if (!state) return initializeRadio(newPlaylistItems);

    // Identify new tracks by comparing video IDs
    const currentIds = new Set();
    if (state.playlist) {
      state.playlist.forEach(item => {
        if (item?.snippet?.resourceId?.videoId) {
          currentIds.add(item.snippet.resourceId.videoId);
        }
      });
    }

    // Find new items not in current playlist
    const newItems = newPlaylistItems.filter(item => 
      !currentIds.has(item?.snippet?.resourceId?.videoId)
    );

    if (newItems.length === 0) {
      debugLog("No new tracks found in playlist");
      return state;
    }

    criticalLog(`Found ${newItems.length} new tracks in playlist`);

    // Add new items to the playlist and shuffle just the new items
    const updatedPlaylist = [...state.playlist, ...newItems];

    // Update state with new playlist
    state.playlist = updatedPlaylist;

    // Save updated state to Firebase
    await set(ref(database, 'radioState'), state);

    // Also save to localStorage as fallback
    localStorage.setItem('radioState', JSON.stringify(state));

    return state;
  } catch (error) {
    console.error('Error updating playlist in Firebase:', error);

    // Fallback to localStorage if Firebase fails
    try {
      const localState = localStorage.getItem('radioState');
      if (!localState) return initializeRadio(newPlaylistItems);

      const state = JSON.parse(localState);

      // Identify new tracks by comparing video IDs
      const currentIds = new Set();
      if (state.playlist) {
        state.playlist.forEach(item => {
          if (item?.snippet?.resourceId?.videoId) {
            currentIds.add(item.snippet.resourceId.videoId);
          }
        });
      }

      // Find new items not in current playlist
      const newItems = newPlaylistItems.filter(item => 
        !currentIds.has(item?.snippet?.resourceId?.videoId)
      );

      if (newItems.length === 0) {
        debugLog("No new tracks found in playlist");
        return state;
      }

      criticalLog(`Found ${newItems.length} new tracks in playlist (localStorage fallback)`);

      // Add new items to the playlist and shuffle just the new items
      const updatedPlaylist = [...state.playlist, ...newItems];

      // Update state with new playlist
      state.playlist = updatedPlaylist;

      // Save updated state to localStorage
      localStorage.setItem('radioState', JSON.stringify(state));

      return state;
    } catch (e) {
      console.error('Error updating playlist in localStorage:', e);
      return initializeRadio(newPlaylistItems);
    }
  }
};

// Subscribe to real-time updates from Firebase
export const subscribeToRadioState = (callback) => {
  try {
    // Reference to the radio state in the database
    const stateRef = ref(database, 'radioState');

    // Listen for changes to the radio state
    const unsubscribe = onValue(stateRef, (snapshot) => {
      if (snapshot.exists()) {
        const state = snapshot.val();
        callback(state);
      }
    });

    return unsubscribe;
  } catch (error) {
    console.error('Error subscribing to radio state:', error);
    return () => {}; // Return empty function if subscription fails
  }
};

// Subscribe to server start time updates
export const subscribeToServerStartTime = (callback) => {
  try {
    // Reference to the server start time in the database
    const startTimeRef = ref(database, 'radioServerStartTime');

    // Listen for changes to the server start time
    const unsubscribe = onValue(startTimeRef, (snapshot) => {
      if (snapshot.exists()) {
        const startTime = parseInt(snapshot.val(), 10);
        callback(startTime);
      }
    });

    return unsubscribe;
  } catch (error) {
    console.error('Error subscribing to server start time:', error);
    return () => {}; // Return empty function if subscription fails
  }
};

// Function to check playlist version by size
export const checkPlaylistVersion = async (newItems) => {
  if (!newItems) return false;

  const state = await getRadioState();
  if (!state || !state.playlist) return true; // No current state, always update

  const currentLength = state.playlist.length;
  const newLength = newItems.length;

  // Added a forceful refresh flag - but now we'll only force a refresh every 10th time
  // This is much less aggressive and won't interrupt playback as often
  const forceRefreshCounter = parseInt(localStorage.getItem('forceRefreshCounter') || '0');
  const newCounter = (forceRefreshCounter + 1) % 10; // Increased from 3 to 10
  localStorage.setItem('forceRefreshCounter', newCounter);

  if (forceRefreshCounter === 0) {
    criticalLog('Periodic playlist check - scanning for changes');
    // Don't automatically return true (force a refresh) anymore
    // We'll still do the checks below to see if a refresh is needed
  }

  // If the playlist sizes differ, it's a new version
  if (currentLength !== newLength) {
    criticalLog(`Playlist size changed: ${currentLength} → ${newLength}`);
    return true;
  }

  // More selective comparison - check all IDs to detect changes including removals
  const currentIds = new Set();
  const newIds = new Set();

  for (let i = 0; i < currentLength; i++) {
    const id = state.playlist[i]?.snippet?.resourceId?.videoId;
    if (id) currentIds.add(id);
  }

  for (let i = 0; i < newLength; i++) {
    const id = newItems[i]?.snippet?.resourceId?.videoId;
    if (id) newIds.add(id);
  }

  // Check for any additions or removals
  if (currentIds.size !== newIds.size) {
    criticalLog(`Playlist content changed: different number of unique video IDs`);
    return true;
  }

  // Check if any videos were removed or added
  let videosRemoved = false;
  let videosAdded = false;

  for (const id of currentIds) {
    if (!newIds.has(id)) {
      criticalLog(`Playlist content changed: video ${id} was removed`);
      videosRemoved = true;
      // Don't return immediately, continue checking
    }
  }

  for (const id of newIds) {
    if (!currentIds.has(id)) {
      criticalLog(`Playlist content changed: video ${id} was added`);
      videosAdded = true;
      // Don't return immediately, continue checking
    }
  }

  // We only return true (indicating need for refresh) if videos were removed
  // Adding videos doesn't require interrupting the current track
  return videosRemoved;
};
