import React, { useState, useEffect, useRef, useCallback, Component } from 'react';
import YouTube from 'react-youtube';
import { fetchPlaylistItems } from './services/youtubeService';
import { 
  getServerStartTime, 
  getRadioState, 
  initializeRadio, 
  getCurrentTrack,
  checkAndResetPlayedTracks,
  getNextUnplayedTrack,
  checkPlaylistVersion,
  resetRadioState,
  updatePlaylist,
  subscribeToRadioState,
  subscribeToServerStartTime
} from './services/radioService';
import { runAllDiagnostics, checkSystemCompatibility } from './services/connectionService';
import './App.css';

// Import new components
import PlaylistDisplay from './components/PlaylistDisplay';
import StatsDisplay from './components/StatsDisplay';
import PingDisplay from './components/PingDisplay';
import FAQ from './components/FAQ';
import Footer from './components/Footer';

// Error Boundary component for YouTube player
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error("YouTube player error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || <div>Something went wrong with the player. Please refresh.</div>;
    }
    return this.props.children;
  }
}

function App() {
  // State for player and UI
  const [currentTrack, setCurrentTrack] = useState(null);
  const [currentPosition, setCurrentPosition] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentTime, setCurrentTime] = useState('0:00');
  const [stablePlayState, setStablePlayState] = useState(true);
  const [showDisclaimerModal, setShowDisclaimerModal] = useState(true);
  const [disclaimerButtonDisabled, setDisclaimerButtonDisabled] = useState(true);
  const [disclaimerCountdown, setDisclaimerCountdown] = useState(10);
  const [upcomingTracks, setUpcomingTracks] = useState([]);

  // State for diagnostics
  const [diagnostics, setDiagnostics] = useState(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  // Refs for player and timers
  const playerRef = useRef(null);
  const timerRef = useRef(null);
  const serverStartTime = useRef(null);
  const lastStateChangeRef = useRef(Date.now());
  const stateChangeTimeoutRef = useRef(null);
  const loadingTimeoutRef = useRef(null);
  const hasInitializedRef = useRef(false);

  // State to track if Firebase is initialized
  const [firebaseInitialized, setFirebaseInitialized] = useState(false);

  // Get API key and playlist ID from environment variables
  const YOUTUBE_API_KEY = process.env.REACT_APP_YOUTUBE_API_KEY;
  const PLAYLIST_ID = process.env.REACT_APP_PLAYLIST_ID;

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

  // Format seconds to MM:SS
  const formatTime = (seconds) => {
    // If it's an ISO duration string, parse it first
    if (typeof seconds === 'string' && seconds.startsWith('PT')) {
      seconds = parseISODuration(seconds);
    }

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds < 10 ? '0' : ''}${remainingSeconds}`;
  };

  // Initialize radio system
  // Flag to control debug logging
  const DEBUG_MODE = false;

  // Controls how often regular status logs are shown (in milliseconds)
  const LOG_INTERVAL = 30000; // 30 seconds

  // Timestamp of last log to enforce interval
  const lastLogRef = useRef(0);

  // Helper function for conditional logging
  const debugLog = (...args) => {
    if (DEBUG_MODE) {
      console.log(...args);
    }
  };

  // Helper function for interval-based logging
  const intervalLog = (...args) => {
    const now = Date.now();
    if (now - lastLogRef.current >= LOG_INTERVAL) {
      console.log(...args);
      lastLogRef.current = now;
      return true;
    }
    return false;
  };

  // Helper function for logging critical events
  const criticalLog = (...args) => {
    // Always log critical events
    console.log(...args);
  };

  // Effect to initialize Firebase and get server start time
  useEffect(() => {
    const initializeFirebase = async () => {
      try {
        // Get server start time from Firebase
        const startTime = await getServerStartTime();
        serverStartTime.current = startTime;
        setFirebaseInitialized(true);
        console.log("Firebase initialized with server start time:", new Date(startTime).toISOString());
      } catch (error) {
        console.error("Error initializing Firebase:", error);
        // Fallback to localStorage if Firebase fails
        const localStartTime = localStorage.getItem('radioServerStartTime');
        if (localStartTime) {
          serverStartTime.current = parseInt(localStartTime, 10);
        } else {
          const newStartTime = Date.now();
          localStorage.setItem('radioServerStartTime', newStartTime.toString());
          serverStartTime.current = newStartTime;
        }
        setFirebaseInitialized(true);
      }
    };

    initializeFirebase();
  }, []);

  // Effect to subscribe to real-time updates from Firebase
  useEffect(() => {
    if (!firebaseInitialized) return;

    // Subscribe to radio state updates
    const unsubscribeRadioState = subscribeToRadioState((newState) => {
      console.log("Received real-time update for radio state");

      // If we have a current track, check if it changed
      if (currentTrack) {
        const currentVideoId = currentTrack.snippet.resourceId.videoId;

        // Find the current track in the new state
        const currentTrackInfo = getCurrentTrack(newState, serverStartTime.current);

        if (currentTrackInfo) {
          const newVideoId = currentTrackInfo.track.snippet.resourceId.videoId;

          // If the track changed, update the UI
          if (currentVideoId !== newVideoId) {
            console.log("Track changed due to real-time update:", currentTrackInfo.track.snippet.title);
            setCurrentTrack(currentTrackInfo.track);
            setCurrentPosition(currentTrackInfo.position);
            setCurrentTime(formatTime(currentTrackInfo.position));

            // If player exists, load the new video
            if (playerRef.current) {
              try {
                playerRef.current.loadVideoById({
                  videoId: newVideoId,
                  startSeconds: currentTrackInfo.position,
                  suggestedQuality: 'small'
                });
              } catch (e) {
                console.error("Error loading new video in real-time update:", e);
              }
            }
          } else {
            // If the track is the same, just update the position
            setCurrentPosition(currentTrackInfo.position);
            setCurrentTime(formatTime(currentTrackInfo.position));
          }
        }
      }

      // Update upcoming tracks
      const updateUpcomingTracks = async () => {
        try {
          // Get current track info from new state
          const currentTrackInfo = getCurrentTrack(newState, serverStartTime.current);
          if (!currentTrackInfo) return;

          // Get current index
          const currentVideoId = currentTrackInfo.track.snippet.resourceId.videoId;
          const currentIndex = newState.playlist.findIndex(
            item => item.snippet.resourceId.videoId === currentVideoId
          );

          // Get the next 5 tracks
          const playlistLength = newState.playlist.length;
          const nextTracks = [];

          for (let i = 1; i <= 5; i++) {
            const nextIndex = (currentIndex + i) % playlistLength;
            nextTracks.push(newState.playlist[nextIndex]);
          }

          setUpcomingTracks(nextTracks);
        } catch (error) {
          console.error("Error updating upcoming tracks in real-time update:", error);
        }
      };

      updateUpcomingTracks();
    });

    // Subscribe to server start time updates
    const unsubscribeServerStartTime = subscribeToServerStartTime((newStartTime) => {
      console.log("Received real-time update for server start time:", new Date(newStartTime).toISOString());
      serverStartTime.current = newStartTime;
    });

    // Clean up subscriptions
    return () => {
      unsubscribeRadioState();
      unsubscribeServerStartTime();
    };
  }, [firebaseInitialized, currentTrack]);

  // Effect to run diagnostics checks
  useEffect(() => {
    const runDiagnostics = async () => {
      if (YOUTUBE_API_KEY && PLAYLIST_ID) {
        const results = await runAllDiagnostics(YOUTUBE_API_KEY, PLAYLIST_ID);
        setDiagnostics(results);

        // If critical diagnostics fail, log a warning
        if (!results.criticalPassed) {
          console.warn("Critical diagnostics failed:", results);
          // Don't set error here to avoid blocking UI, just show diagnostics
        }
      } else {
        setDiagnostics({
          results: {
            apiKey: { success: false, message: 'API key is missing' },
            playlist: { success: false, message: 'Playlist ID is missing' },
            internet: { success: false, message: 'Cannot check without API key' },
            youtube: { success: false, message: 'Cannot check without API key' },
            system: checkSystemCompatibility() // Still check system compatibility
          },
          allPassed: false,
          criticalPassed: false,
          summary: 'Required configuration is missing'
        });
      }
    };

    runDiagnostics();
  }, [YOUTUBE_API_KEY, PLAYLIST_ID]);

  useEffect(() => {
    const initializeRadioSystem = async () => {
      // Initialization is critical, always log it
      criticalLog("Starting initialization");
      try {
        // Always set loading to true at the start
        setIsLoading(true);

        // Check for API keys
        if (!YOUTUBE_API_KEY || !PLAYLIST_ID) {
          console.error("Missing API Key or Playlist ID");
          setError('Missing YouTube API key or Playlist ID. Please check your environment variables.');
          setIsLoading(false);
          return;
        }

        // Wait for Firebase to be initialized
        if (!firebaseInitialized || !serverStartTime.current) {
          console.log("Waiting for Firebase to initialize...");
          setIsLoading(false);
          return;
        }

        const items = await fetchPlaylistItems(YOUTUBE_API_KEY, PLAYLIST_ID);
        debugLog(`Fetched ${items?.length || 0} playlist items`);

        if (!items || items.length === 0) {
          setError('No tracks found in the playlist. Please check your Playlist ID.');
          setIsLoading(false);
          return;
        }

        // Check if radio state exists, initialize if it doesn't
        let radioState = await getRadioState();
        if (!radioState) {
          criticalLog("Initializing new radio state");
          radioState = await initializeRadio(items);
        }

        // Get current track based on server time
        const currentTrackInfo = getCurrentTrack(radioState, serverStartTime.current);

        if (currentTrackInfo) {
          criticalLog("Starting with track:", currentTrackInfo.track.snippet.title);

          // Update UI immediately
          setCurrentTrack(currentTrackInfo.track);
          setCurrentPosition(currentTrackInfo.position);
          setCurrentTime(formatTime(currentTrackInfo.position));

          // Wait a short time before hiding loading screen
          // to ensure UI is ready
          loadingTimeoutRef.current = setTimeout(() => {
            criticalLog("Initialization complete");
            setIsLoading(false);
            hasInitializedRef.current = true;
          }, 500);
        } else {
          console.error("No current track found");
          setError('No tracks available for playback.');
          setIsLoading(false);
        }
      } catch (err) {
        console.error('Error setting up radio:', err);
        setError('Failed to start radio: ' + (err.message || 'Unknown error'));
        setIsLoading(false);
      }
    };

    if (!hasInitializedRef.current && firebaseInitialized) {
      console.log("Starting first-time initialization");
      initializeRadioSystem();
    }

    // Cleanup function
    return () => {
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
      }
    };
  }, [YOUTUBE_API_KEY, PLAYLIST_ID, firebaseInitialized]); // Dependencies

  // Add a fallback to exit loading state after timeout
  useEffect(() => {
    // If we're still loading after 10 seconds, force exit loading state
    const loadingFallbackTimer = setTimeout(() => {
      if (isLoading) {
        console.log("Loading timeout - forcing exit from loading state");
        setIsLoading(false);
        if (!currentTrack) {
          setError('Loading timed out. Please refresh the page to try again.');
        }
      }
    }, 10000);

    return () => clearTimeout(loadingFallbackTimer);
  }, [isLoading, currentTrack]); // Added proper dependencies

  // Setup timer to update current position
  useEffect(() => {
    const updateCurrentPosition = async () => {
      if (isLoading) return; // Skip updates while loading

      // Wait for Firebase to be initialized
      if (!firebaseInitialized || !serverStartTime.current) {
        console.log("Waiting for Firebase to initialize in timer...");
        return;
      }

      try {
        const radioState = await getRadioState();
        if (!radioState) {
          console.warn("No radio state found in timer");
          return;
        }

        const currentTrackInfo = getCurrentTrack(radioState, serverStartTime.current);
        if (!currentTrackInfo) {
          console.warn("No current track info found in timer");
          return;
        }

        // Update position and time regardless of track change
        setCurrentPosition(currentTrackInfo.position);
        setCurrentTime(formatTime(currentTrackInfo.position));

        // Update track if it changed
        const currentVideoId = currentTrack?.snippet?.resourceId?.videoId;
        const newVideoId = currentTrackInfo.track?.snippet?.resourceId?.videoId;

        if (!currentVideoId || currentVideoId !== newVideoId) {
          // This is a critical event, always log it
          criticalLog("Track changed to:", currentTrackInfo.track.snippet.title);
          setCurrentTrack(currentTrackInfo.track);

          // Define safe player operation function
          const safePlayerOperation = (operation, name) => {
            if (!playerRef.current) return false;
            try {
              operation();
              return true;
            } catch (e) {
              console.error(`Failed to execute ${name} operation:`, e);

              // If there's a persistent error with the player, try to reset it
              if (e.message && e.message.includes("null")) {
                console.log("Player reference invalid, will try to recover");
                playerRef.current = null;

                // Force refresh to recover from this state
                setTimeout(() => {
                  console.log("Attempting to reset player state...");
                  setCurrentTrack(prev => ({...prev})); // Force re-render
                }, 1000);
              }
              return false;
            }
          };

          // If player exists, load and seek to correct position with safe operation
          if (playerRef.current) {
            debugLog("Loading new video in player");
            const loadSuccess = safePlayerOperation(() => {
              playerRef.current.loadVideoById({
                videoId: newVideoId,
                startSeconds: currentTrackInfo.position,
                suggestedQuality: 'small'
              });
            }, "loadVideoById");

            // If load failed, retry after a delay
            if (!loadSuccess) {
              setTimeout(() => {
                if (playerRef.current) {
                  console.log("Retrying video load after failure");
                  safePlayerOperation(() => {
                    playerRef.current.loadVideoById({
                      videoId: newVideoId,
                      startSeconds: currentTrackInfo.position,
                      suggestedQuality: 'small'
                    });
                  }, "loadVideoById retry");
                }
              }, 2000);
            }
          }
        }
      } catch (error) {
        console.error("Error updating current position:", error);
      }
    };

    // Only set up timer if Firebase is initialized
    if (firebaseInitialized) {
      // Call immediately and then set up interval
      updateCurrentPosition();

      timerRef.current = setInterval(updateCurrentPosition, 1000);

      // Set up automatic playlist refresh - check less frequently
      const playlistRefreshInterval = setInterval(() => {
        console.log("Checking for playlist updates");
        refreshPlaylist();
      }, 5 * 60 * 1000); // Every 5 minutes (changed from 1 minute)

      // Only force a state reset once per hour and use the more conservative refresh function
      const forceResetInterval = setInterval(() => {
        console.log("Periodic playlist check");
        // Don't reset the state completely anymore, just refresh playlist
        refreshPlaylist(); // Use our updated non-disruptive refresh function
      }, 60 * 60 * 1000); // Every 60 minutes (changed from 5 minutes)

      return () => {
        if (timerRef.current) {
          clearInterval(timerRef.current);
        }
        clearInterval(playlistRefreshInterval);
        clearInterval(forceResetInterval);
      };
    }
      // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [currentTrack, isLoading, firebaseInitialized]); // Disabling lint for external functions

  // Global cleanup effect
  useEffect(() => {
    return () => {
      // Clean up all timers and refs
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (stateChangeTimeoutRef.current) {
        clearTimeout(stateChangeTimeoutRef.current);
      }
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
      }
    };
  }, []); // Run once on mount

  // Use a visible but small player
  const opts = {
    height: '80',
    width: '80',
    playerVars: {
      autoplay: 1,
      controls: 0, // Hide controls since we'll provide our own
      disablekb: 0, // Enable keyboard controls
      fs: 0,
      modestbranding: 1,
      rel: 0,
      iv_load_policy: 3,
      // Start muted to comply with autoplay policies, we'll unmute after user interaction
      mute: 1,
      vq: 'small', // Low quality is sufficient for audio
      html5: 1, // Force HTML5 player
      playsinline: 1, // Required for autoplay on mobile
      enablejsapi: 1, // Enable JavaScript API
      // Fix for postMessage origin mismatch errors
      origin: 'http://localhost:3000',
    },
    // Add onError handler at YouTube component level
    onError: (e) => console.log("YouTube player error:", e)
  };

  // Audio context reference
  const audioContextRef = useRef(null);

  // Function to initialize audio context on user interaction
  const startAutoPlayback = () => {
    // Only create AudioContext after user interaction
    // This will be called after a user gesture (like clicking a button)
    if (typeof window !== 'undefined' && !audioContextRef.current) {
      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) {
          // Create the context after user interaction
          audioContextRef.current = new AudioContext();
          // Resume immediately since we're in a user gesture handler
          if (audioContextRef.current.state !== 'running') {
            audioContextRef.current.resume().catch(err => {
              console.error('Failed to resume AudioContext:', err);
            });
          }
        }
      } catch (e) {
        console.error('AudioContext initialization failed', e);
      }
    }
  };

          // Function to resume audio context after user interaction
          const resumeAudioContext = () => {
            if (audioContextRef.current && audioContextRef.current.state !== 'running') {
              audioContextRef.current.resume().then(() => {
        // Don't log resumption
      }).catch(err => {
        console.error('Failed to resume AudioContext:', err);
      });
    }

    // Clear any hanging timeouts
    if (unstartedTimeoutRef.current) {
      clearTimeout(unstartedTimeoutRef.current);
    }
  };

  // Create refs to track error states
  const playerErrorCountRef = useRef(0);
  const playerInvalidStateRef = useRef(0);
  const unstartedTimeoutRef = useRef(null);

  // Define a state variable to force component re-renders
  const [playerResetCounter, setPlayerResetCounter] = useState(0);

  // Function to destroy and recreate the player when it gets into a bad state
  const resetYouTubePlayer = () => {
    console.log("Attempting to reset YouTube player");

    // Clean up old player instance
    if (playerRef.current) {
      try {
        playerRef.current.stopVideo();
      } catch (e) {
        // Ignore errors during cleanup
      }
      playerRef.current = null;
    }

    // Increment counter to force re-render of component
    setPlayerResetCounter(prev => prev + 1);

    // Set a timeout to check if the player is working after reset
    setTimeout(() => {
      if (!playerRef.current) {
        console.log("Player still not initialized after reset");
      } else {
        console.log("Player reset completed");
      }
    }, 3000);
  };

  // YouTube player error handler
  const onPlayerError = (event) => {
    console.error("YouTube player error:", event.data);

    // Track consecutive errors
    playerErrorCountRef.current += 1;

    if (playerErrorCountRef.current > 3) {
      console.log("Multiple YouTube player errors detected, attempting reset");
      resetYouTubePlayer();
      playerErrorCountRef.current = 0;
    }
  };

          // Function to refresh the playlist to get new songs
          const refreshPlaylist = async () => {
            criticalLog("Manually refreshing playlist");
            setIsLoading(true);

            try {
              // Wait for Firebase to be initialized
              if (!firebaseInitialized || !serverStartTime.current) {
                console.log("Waiting for Firebase to initialize in refreshPlaylist...");
                setIsLoading(false);
                return;
              }

              // Store current track information before refresh
              const currentVideoId = currentTrack?.snippet?.resourceId?.videoId;
              const currentTime = currentPosition;

              // Fetch the latest playlist items
              const items = await fetchPlaylistItems(YOUTUBE_API_KEY, PLAYLIST_ID);

              if (!items || items.length === 0) {
                setError("Failed to fetch playlist items");
                setIsLoading(false);
                return;
              }

              criticalLog(`Fetched ${items.length} playlist items`);

              // Check if the playlist has changed significantly (new videos added/removed)
              const playlistChanged = await checkPlaylistVersion(items);
              if (playlistChanged) {
                // Instead of resetting the state completely, update it while preserving the current track

                // First check if current track exists in the new playlist
                const currentTrackStillExists = currentVideoId && 
                  items.some(item => item?.snippet?.resourceId?.videoId === currentVideoId);

                if (currentTrackStillExists) {
                  // Current track still exists, just update the playlist
                  criticalLog("Current track still exists in updated playlist - maintaining playback");
                  await updatePlaylist(items);
                } else {
                  // Only reset if current track is gone from the playlist
                  criticalLog("Current track no longer in playlist - resetting state");
                  await resetRadioState();

                  // Re-initialize with new items
                  const radioState = await initializeRadio(items);

                  // Get current track based on server time
                  const currentTrackInfo = getCurrentTrack(radioState, serverStartTime.current);

                  if (currentTrackInfo) {
                    criticalLog("Starting with new track:", currentTrackInfo.track.snippet.title);

                    // Update UI
                    setCurrentTrack(currentTrackInfo.track);
                    setCurrentPosition(currentTrackInfo.position);
                    setCurrentTime(formatTime(currentTrackInfo.position));

                    // Define safe player operation function
                    const safePlayerOperation = (operation, name) => {
                      if (!playerRef.current) return false;
                      try {
                        operation();
                        return true;
                      } catch (e) {
                        console.error(`Failed to execute ${name} operation in refreshPlaylist:`, e);
                        return false;
                      }
                    };

                    // If player exists, load new video with safe operation
                    if (playerRef.current) {
                      const videoId = currentTrackInfo.track?.snippet?.resourceId?.videoId;

                      const loadSuccess = safePlayerOperation(() => {
                        playerRef.current.loadVideoById({
                          videoId: videoId,
                          startSeconds: currentTrackInfo.position,
                          suggestedQuality: 'small'
                        });
                      }, "loadVideoById");

                      // If load failed, retry after a delay
                      if (!loadSuccess) {
                        setTimeout(() => {
                          if (playerRef.current) {
                            console.log("Retrying video load after failure in refreshPlaylist");
                            safePlayerOperation(() => {
                              playerRef.current.loadVideoById({
                                videoId: videoId,
                                startSeconds: currentTrackInfo.position,
                                suggestedQuality: 'small'
                              });
                            }, "loadVideoById retry");
                          }
                        }, 2000);
                      }
                    }
                  }
                }
              } else {
                // Just update the existing playlist with any new items
                await updatePlaylist(items);
              }
            } catch (error) {
              console.error("Error refreshing playlist:", error);
              setError("Failed to refresh playlist");
            }

            setIsLoading(false);
          };

  // Track user interaction to enable audio
  const [userInteracted, setUserInteracted] = useState(false);

  // Effect for disclaimer button countdown
  useEffect(() => {
    let timer;
    if (showDisclaimerModal && disclaimerButtonDisabled) {
      timer = setInterval(() => {
        setDisclaimerCountdown(prevCount => {
          if (prevCount <= 1) {
            clearInterval(timer);
            setDisclaimerButtonDisabled(false);
            return 0;
          }
          return prevCount - 1;
        });
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [showDisclaimerModal, disclaimerButtonDisabled]);

  // Set up event listener for user interaction
  useEffect(() => {
    const handleUserInteraction = () => {
      setUserInteracted(true);

      // Resume audio context
      resumeAudioContext();

      // Define safe player operation function
      const safePlayerOperation = (operation, name) => {
        if (!playerRef.current) return false;
        try {
          operation();
          return true;
        } catch (e) {
          console.log(`Failed to execute ${name} operation in user interaction:`, e.message);
          return false;
        }
      };

      // Safely unmute the player if it exists and is ready
      if (playerRef.current) {
        // First check if player is initialized properly
        let playerIsReady = false;

        safePlayerOperation(() => {
          const playerState = playerRef.current.getPlayerState();
          playerIsReady = typeof playerState === 'number';
        }, "getPlayerState");

        if (playerIsReady) {
          // Player is initialized properly, unmute it
          const unmuteSuccess = safePlayerOperation(() => {
            playerRef.current.unMute();
            playerRef.current.setVolume(100);
            console.log("Player unmuted after user interaction");
          }, "unmute");

          // If unmute failed, retry after a delay
          if (!unmuteSuccess) {
            setTimeout(() => {
              safePlayerOperation(() => {
                playerRef.current.unMute();
                playerRef.current.setVolume(100);
              }, "unmute retry");
            }, 1500);
          }
        } else {
          console.log("Player not fully initialized yet, will unmute when ready");
          // We'll handle this in onPlayerReady instead
        }
      }

      // Remove the listeners after first interaction
      document.removeEventListener('click', handleUserInteraction);
      document.removeEventListener('touchstart', handleUserInteraction);
    };

    // Add listeners for user interaction
    document.addEventListener('click', handleUserInteraction);
    document.addEventListener('touchstart', handleUserInteraction);

    // Initialize audio context (but don't start it yet)
    startAutoPlayback();

    // Clean up
    return () => {
      document.removeEventListener('click', handleUserInteraction);
      document.removeEventListener('touchstart', handleUserInteraction);
    };
  }, []);

  const onPlayerReady = useCallback((event) => {
    try {
      // Player ready is a critical event
      criticalLog("YouTube player is ready");
      playerRef.current = event.target;

      // Ensure the iframe has the correct origin attribute for postMessage
      try {
        const iframe = event.target.getIframe();
        if (iframe) {
          // Force the origin attribute to match our hardcoded value
          iframe.setAttribute('origin', 'http://localhost:3000');
        }
      } catch (originError) {
        console.warn("Could not set iframe origin attribute:", originError.message);
      }

      // Configure player for audio-only low quality
      if (event.target) {
        try {
          event.target.setPlaybackQuality('small');
        } catch (e) {
          console.log("Could not set playback quality, ignoring:", e.message);
        }

        // Initialize player with increased delay to ensure player is fully loaded
        // YouTube's API sometimes reports ready before it's fully initialized
        setTimeout(() => {
          // Check if player ref is still valid
          if (!playerRef.current) {
            console.log("Player ref is no longer valid");
            return;
          }

          // Use a safe player operation function to handle potential null references
          const safePlayerOperation = (operation, name) => {
            if (!playerRef.current) return false;
            try {
              operation();
              return true;
            } catch (e) {
              console.error(`Failed to execute ${name} operation:`, e);

              // Check for common null reference errors and reset player if needed
              if (e.message && (
                  e.message.includes("this.g is null") || 
                  e.message.includes("Cannot read properties of null") ||
                  e.message.includes("undefined")
              )) {
                console.warn(`Detected null reference in ${name}, will reset player reference`);
                // Reset the player reference to force re-initialization
                playerRef.current = null;
              }

              return false;
            }
          };

          // More thorough check to ensure player is fully initialized
          const verifyPlayerReady = () => {
            try {
              // Try multiple API calls to ensure player is fully ready
              const state = playerRef.current.getPlayerState();
              const volume = playerRef.current.getVolume();
              const isMuted = playerRef.current.isMuted();

              // If all these calls succeed, the player should be ready
              return typeof state === 'number' && typeof volume === 'number' && typeof isMuted === 'boolean';
            } catch (e) {
              console.log("Player not fully initialized during verification:", e.message);
              return false;
            }
          };

          // Check if player is ready
          const playerIsReady = verifyPlayerReady();

          if (!playerIsReady) {
            console.log("Player not fully initialized, setting up retry with longer delay");
            // Try again with a longer delay - sometimes the player needs more time
            setTimeout(() => onPlayerReady(event), 2500);
            return;
          }

          // Execute operations sequentially with delays between them
          const executeSequentially = () => {
            // Step 1: Seek to current position (if needed)
            if (currentPosition > 0) {
              setTimeout(() => {
                const seekSuccess = safePlayerOperation(() => {
                  playerRef.current.seekTo(currentPosition);
                }, "seekTo");

                // If seek fails, don't proceed to next steps
                if (!seekSuccess) {
                  console.log("Seek failed, will retry player initialization");
                  setTimeout(() => onPlayerReady(event), 3000);
                  return;
                }

                // Step 2: Start playing
                setTimeout(() => {
                  const playSuccess = safePlayerOperation(() => {
                    playerRef.current.playVideo();
                  }, "playVideo");

                  if (!playSuccess) {
                    // Retry play after a longer delay
                    setTimeout(() => {
                      safePlayerOperation(() => {
                        playerRef.current.playVideo();
                      }, "playVideo retry");
                    }, 1500);
                  }

                  // Step 3: Unmute if user has interacted
                  if (userInteracted) {
                    setTimeout(() => {
                      const unmuteSuccess = safePlayerOperation(() => {
                        playerRef.current.unMute();
                        playerRef.current.setVolume(100);
                        console.log("Player unmuted due to prior user interaction");
                      }, "unmute");

                      if (!unmuteSuccess) {
                        // Retry unmute after a longer delay
                        setTimeout(() => {
                          safePlayerOperation(() => {
                            playerRef.current.unMute();
                            playerRef.current.setVolume(100);
                          }, "unmute retry");
                        }, 1500);
                      }
                    }, 500); // Delay before unmute
                  }
                }, 500); // Delay before play
              }, 500); // Delay before seek
            } else {
              // If no seek needed, start with play
              setTimeout(() => {
                const playSuccess = safePlayerOperation(() => {
                  playerRef.current.playVideo();
                }, "playVideo");

                if (!playSuccess) {
                  // Retry play after a longer delay
                  setTimeout(() => {
                    safePlayerOperation(() => {
                      playerRef.current.playVideo();
                    }, "playVideo retry");
                  }, 1500);
                }

                // Unmute if user has interacted
                if (userInteracted) {
                  setTimeout(() => {
                    const unmuteSuccess = safePlayerOperation(() => {
                      playerRef.current.unMute();
                      playerRef.current.setVolume(100);
                      console.log("Player unmuted due to prior user interaction");
                    }, "unmute");

                    if (!unmuteSuccess) {
                      // Retry unmute after a longer delay
                      setTimeout(() => {
                        safePlayerOperation(() => {
                          playerRef.current.unMute();
                          playerRef.current.setVolume(100);
                        }, "unmute retry");
                      }, 1500);
                    }
                  }, 500); // Delay before unmute
                }
              }, 500); // Delay before play
            }
          };

          // Start the sequential execution
          executeSequentially();

          // Set player state to indicate it's ready
          setStablePlayState(true);
        }, 2000); // Increased delay from 1500ms to 2000ms for better initialization
      }
    } catch (error) {
      console.error("Error in onPlayerReady:", error);
    }
  }, [currentPosition, userInteracted, setStablePlayState]);

  // More robust state change handler
  const onPlayerStateChange = async (event) => {
    try {
      // YouTube player states: -1 (unstarted), 0 (ended), 1 (playing), 2 (paused), 3 (buffering), 5 (video cued)
      // Don't log regular state changes
      const now = Date.now();

      // Define safe player operation function for state change handler
      const safePlayerOperation = (operation, name) => {
        if (!playerRef.current) return false;
        try {
          operation();
          return true;
        } catch (e) {
          console.error(`Failed to execute ${name} operation in state change:`, e);
          return false;
        }
      };

      // Handle video ended event (0)
      if (event.data === 0) {
        debugLog("Video ended, updating to next track");

        // Wait for Firebase to be initialized
        if (!firebaseInitialized || !serverStartTime.current) {
          console.log("Waiting for Firebase to initialize in onPlayerStateChange...");
          return;
        }

        try {
          // Get radio state
          const radioState = await getRadioState();
          if (radioState) {
            // Check if we need to reset played tracks (if all tracks have been played)
            if (radioState.playedTracks && 
                radioState.playedTracks.length >= radioState.playlist.length) {
              // All tracks have been played, reset and reshuffle
              criticalLog("All tracks have been played, reshuffling playlist");
              await checkAndResetPlayedTracks();

              // Get fresh state after reset
              const freshState = await getRadioState();
              if (freshState) {
                const currentTrackInfo = getCurrentTrack(freshState, serverStartTime.current);
                if (currentTrackInfo) {
                  console.log("Loading next track after playlist reset:", currentTrackInfo.track.snippet.title);
                  setCurrentTrack(currentTrackInfo.track);
                  setCurrentPosition(currentTrackInfo.position);
                  setCurrentTime(formatTime(currentTrackInfo.position));
                }
              }
            } else {
              // Get next track that hasn't been played yet
              const currentTrackInfo = getCurrentTrack(radioState, serverStartTime.current);
              if (currentTrackInfo) {
                console.log("Loading next track:", currentTrackInfo.track.snippet.title);
                setCurrentTrack(currentTrackInfo.track);
                setCurrentPosition(currentTrackInfo.position);
                setCurrentTime(formatTime(currentTrackInfo.position));
              }
            }
          }
        } catch (error) {
          console.error("Error handling track end in onPlayerStateChange:", error);
        }
      }

      // Robust state handling
      if (event.data === 1) { // Playing
        setStablePlayState(true);

        // Ensure we're unmuted and volume is up with safe operation
        setTimeout(() => {
          // First check if player is muted
          let isMuted = false;
          safePlayerOperation(() => {
            isMuted = playerRef.current.isMuted();
          }, "isMuted check");

          // If muted or we couldn't determine, try to unmute
          if (isMuted || isMuted === undefined) {
            safePlayerOperation(() => {
              playerRef.current.unMute();
              playerRef.current.setVolume(100);
            }, "unmute during playing");
          }
        }, 500);
      } else if (event.data === 2) { // Paused
        // Always try to resume playback to maintain radio-like behavior
        setTimeout(() => {
          // Try to play video with safe operation
          const playSuccess = safePlayerOperation(() => {
            playerRef.current.playVideo();
          }, "playVideo during paused");

          // If play succeeded, ensure we're unmuted
          if (playSuccess) {
            setTimeout(() => {
              safePlayerOperation(() => {
                playerRef.current.unMute();
                playerRef.current.setVolume(100);
              }, "unmute after resume");
            }, 500);
          } else {
            // If play failed, try again with longer delay
            setTimeout(() => {
              safePlayerOperation(() => {
                playerRef.current.playVideo();
              }, "playVideo retry during paused");

              // Try to unmute again
              setTimeout(() => {
                safePlayerOperation(() => {
                  playerRef.current.unMute();
                  playerRef.current.setVolume(100);
                }, "unmute retry after resume");
              }, 500);
            }, 1500);
          }
        }, 500);
      } else if (event.data === -1) { // Unstarted
        // Try to play video with safe operation and longer delay
        setTimeout(() => {
          const playSuccess = safePlayerOperation(() => {
            playerRef.current.playVideo();
          }, "playVideo during unstarted");

          // If play succeeded, ensure we're unmuted
          if (playSuccess) {
            setTimeout(() => {
              safePlayerOperation(() => {
                playerRef.current.unMute();
                playerRef.current.setVolume(100);
              }, "unmute after unstarted");
            }, 1000);
          } else {
            // If play failed, try again with longer delay
            setTimeout(() => {
              safePlayerOperation(() => {
                playerRef.current.playVideo();
              }, "playVideo retry during unstarted");

              // Try to unmute again
              setTimeout(() => {
                safePlayerOperation(() => {
                  playerRef.current.unMute();
                  playerRef.current.setVolume(100);
                }, "unmute retry after unstarted");
              }, 1000);
            }, 2000);
          }
        }, 1000);
      } else if (event.data === 3) { // Buffering
        // Ensure we remain unmuted during buffering with safe operation
        setTimeout(() => {
          safePlayerOperation(() => {
            playerRef.current.unMute();
            playerRef.current.setVolume(100);
          }, "unmute during buffering");
        }, 1000);
      }

      // Always update the timestamp to track last state change
      lastStateChangeRef.current = now;
    } catch (error) {
      console.error("Error in onPlayerStateChange:", error);
    }
  };

  // We've removed the handleUnmute function since we're now using automatic unmuting
  // and don't have an unmute button anymore

  // Function to get upcoming tracks from the playlist
  const getUpcomingTracks = useCallback(async () => {
    try {
      // Wait for Firebase to be initialized
      if (!firebaseInitialized || !serverStartTime.current) {
        console.log("Waiting for Firebase to initialize in getUpcomingTracks...");
        return [];
      }

      const radioState = await getRadioState();
      if (!radioState || !radioState.playlist || !currentTrack) return [];

      // Get current index
      const currentVideoId = currentTrack.snippet.resourceId.videoId;
      const currentIndex = radioState.playlist.findIndex(
        item => item.snippet.resourceId.videoId === currentVideoId
      );

      // Get the next 5 tracks (or loop back to start if needed)
      const playlistLength = radioState.playlist.length;
      const nextTracks = [];

      for (let i = 1; i <= 5; i++) {
        const nextIndex = (currentIndex + i) % playlistLength;
        nextTracks.push(radioState.playlist[nextIndex]);
      }

      return nextTracks;
    } catch (error) {
      console.error("Error getting upcoming tracks:", error);
      return [];
    }
  }, [currentTrack, firebaseInitialized]);

  // Function to optimize player for audio only
  const optimizeForAudioOnly = () => {
    if (playerRef.current) {
      // Define safe player operation function
      const safePlayerOperation = (operation, name) => {
        if (!playerRef.current) return false;
        try {
          operation();
          return true;
        } catch (e) {
          console.log(`Failed to execute ${name} operation in optimizeForAudioOnly:`, e.message);

          // Reset the player reference if it's causing null errors
          if (e.message && e.message.includes("null")) {
            console.log("Resetting invalid player reference in optimizeForAudioOnly");
            playerRef.current = null;
          }

          return false;
        }
      };

      // Set to lowest quality to save bandwidth with safe operation
      safePlayerOperation(() => {
        playerRef.current.setPlaybackQuality('small');
      }, "setPlaybackQuality");
    }
  };

  // Call optimize function when player is ready and periodically
  useEffect(() => {
    const optimizeInterval = setInterval(() => {
      optimizeForAudioOnly();
    }, 10000); // Check every 10 seconds

    return () => {
      clearInterval(optimizeInterval);
    };
  }, []); // Empty dependency array - run once on mount

  // Effect to maintain unmuted state when track changes
  // and update upcoming tracks list
  useEffect(() => {
    // Short delay to ensure the player is ready after track changes
    const unmuteMaintainer = setTimeout(() => {
      if (playerRef.current) {
        try {
          // Don't log unmute actions
          playerRef.current.unMute();
          playerRef.current.setVolume(100);
        } catch (err) {
          console.error("Error in unmuteMaintainer:", err);

          // Reset the player reference if it's causing errors
          if (err.message && err.message.includes("null")) {
            console.log("Resetting invalid player reference");
            playerRef.current = null;
          }
        }
      }
    }, 2000);

    // Update upcoming tracks when current track changes
    if (currentTrack && firebaseInitialized) {
      // Use an async function inside the effect
      const updateUpcomingTracks = async () => {
        try {
          const nextTracks = await getUpcomingTracks();
          setUpcomingTracks(nextTracks);
        } catch (error) {
          console.error("Error updating upcoming tracks:", error);
        }
      };

      updateUpcomingTracks();
    }

    return () => clearTimeout(unmuteMaintainer);
  }, [currentTrack, getUpcomingTracks, firebaseInitialized]); // Depends on track changes, getUpcomingTracks function, and Firebase initialization

  // We no longer need the force trigger function since we're using an explicit play button

  // Determine if we should show the loading screen
  const showLoading = isLoading && !error;
  // Determine if we should render the player - do this even during loading
  // so the player can start initializing in the background
  const shouldRenderPlayer = currentTrack !== null;

  // Calculate progress percentage for the progress bar
  const calculateProgress = () => {
    if (!currentTrack) return 0;
    const duration = currentTrack.contentDetails?.duration;
    if (!duration) return 0;

    const durationInSeconds = parseISODuration(duration);
    if (durationInSeconds <= 0) return 0;

    return (currentPosition / durationInSeconds) * 100;
  };

  // Get background image from current track if available
  const getBackgroundImage = () => {
    if (!currentTrack || !currentTrack.snippet.thumbnails.high) return '';
    return currentTrack.snippet.thumbnails.high.url;
  };

  return (
    <div className="App">
      <div className="main-content">
        {/* Background elements */}
        <div 
          className="background-cover" 
          style={{ backgroundImage: `url(${getBackgroundImage()})` }}
        ></div>
        <div className="background-overlay"></div>

        {/* Invisible player */}
        {shouldRenderPlayer && (
          <div className="player-wrapper">
            <div className="hidden-player">
              <ErrorBoundary fallback={<div>YouTube player error - refresh page</div>}>
                <YouTube
                  videoId={currentTrack.snippet.resourceId.videoId}
                  opts={opts}
                  onReady={onPlayerReady}
                  onStateChange={onPlayerStateChange}
                  onError={(e) => console.error("YouTube player error:", e)}
                />
              </ErrorBoundary>
            </div>
          </div>
        )}

        {/* Progress bar */}
        {currentTrack && (
          <div className="progress-container">
            <div className="time-display">
              <span>{currentTime}</span>
              <span>{currentTrack.contentDetails?.duration ? formatTime(currentTrack.contentDetails.duration) : '--:--'}</span>
            </div>
            <div className="progress-bar">
              <div 
                className="progress-fill" 
                style={{ width: `${calculateProgress()}%` }}
              ></div>
            </div>
          </div>
        )}

        {/* Now playing info */}
        {currentTrack && (
          <div className="now-playing-info">
            <div className="track-info">
              <div className="now-playing-text">{currentTrack.snippet.title}</div>
            </div>

            {/* Next up tracks */}
            {upcomingTracks.length > 0 && (
              <div>
                {upcomingTracks.slice(0, 1).map((track, index) => (
                  <div key={`next-${track.snippet.resourceId.videoId}`} className="next-up-text">
                    Coming Up Next: {track.snippet.title}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Unmute overlay */}
        {!userInteracted && currentTrack && (
          <div className="unmute-overlay">
            <button 
              className="unmute-button"
              onClick={() => {
                setUserInteracted(true);
                resumeAudioContext();

                // Define safe player operation function
                const safePlayerOperation = (operation, name) => {
                  if (!playerRef.current) return false;
                  try {
                    operation();
                    return true;
                  } catch (e) {
                    console.log(`Failed to execute ${name} operation in unmute button:`, e.message);
                    return false;
                  }
                };

                if (playerRef.current) {
                  // Try to unmute with safe operation
                  const unmuteSuccess = safePlayerOperation(() => {
                    playerRef.current.unMute();
                    playerRef.current.setVolume(100);
                  }, "unmute");

                  // If unmute failed, retry after a delay
                  if (!unmuteSuccess) {
                    setTimeout(() => {
                      safePlayerOperation(() => {
                        playerRef.current.unMute();
                        playerRef.current.setVolume(100);
                      }, "unmute retry");
                    }, 1500);
                  }
                }
              }}
            >
              Click to Unmute Audio
            </button>
          </div>
        )}

        {/* Loading and error states */}
        {showLoading ? (
          <div className="loading-container">
            <p>Loading radio station...</p>
          </div>
        ) : error ? (
          <div className="error-container">
            <p className="error">{error}</p>
          </div>
        ) : null}

        {/* Disclaimer Modal */}
        {showDisclaimerModal && (
          <div className="modal-overlay">
            <div className="disclaimer-modal">
              <h3>Important Disclaimer</h3>
              <p>
                The playlist you are about to listen to is being created by students.
                The website has no responsibility for the content of the songs that are being played.
              </p>
              <p>
                We do not collect or share any information about who added these songs to the playlist.
              </p>
              <button 
                className="modal-close-button" 
                onClick={() => setShowDisclaimerModal(false)}
                disabled={disclaimerButtonDisabled}
              >
                {disclaimerButtonDisabled 
                  ? `I Understand (${disclaimerCountdown}s)` 
                  : 'I Understand'}
              </button>
            </div>
          </div>
        )}

        {/* Diagnostics button and panel - positioned at the very bottom of the background */}
        <div style={{ position: 'absolute', bottom: '-100px', right: '10px', zIndex: 100 }}>
          <button 
            className="diagnostics-button" 
            onClick={() => setShowDiagnostics(!showDiagnostics)}
            style={{ background: 'rgba(0,0,0,0.5)', color: 'white', border: '1px solid white', padding: '5px 10px', borderRadius: '5px' }}
          >
            {showDiagnostics ? 'Hide' : 'Show'} Diagnostics
          </button>

          {showDiagnostics && diagnostics && (
            <div className="diagnostics-panel" style={{ position: 'absolute', bottom: '40px', right: '0', background: 'rgba(0,0,0,0.8)', padding: '10px', borderRadius: '5px', maxWidth: '300px', maxHeight: '300px', overflow: 'auto' }}>
              <h3>System Diagnostics</h3>
              <div className={`diagnostics-summary ${diagnostics.criticalPassed ? 'success' : 'error'}`}>
                {diagnostics.summary}
                {!diagnostics.allPassed && diagnostics.criticalPassed && (
                  <div className="diagnostics-note">
                    Note: Some non-critical checks failed (possibly due to CORS). App should still function.
                  </div>
                )}
              </div>
              <ul className="diagnostics-list">
                {Object.entries(diagnostics.results).map(([key, check]) => {
                  const isCritical = ['apiKey', 'playlist', 'system'].includes(key);
                  return (
                    <li key={key} className={`${check.success ? 'success' : 'error'} ${isCritical ? 'critical' : 'non-critical'}`}>
                      <strong>{key}:</strong> {check.message}
                      {!check.success && !isCritical && 
                        <span className="non-critical-note"> (may fail in local dev due to CORS)</span>
                      }
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Additional content below the main player */}
      <div className="additional-content" id="content">
        <div className="container">
          {/* Stats Display */}
          <StatsDisplay playedTracks={getRadioState()?.playedTracks} />

          {/* Ping Display */}
          <PingDisplay apiKey={YOUTUBE_API_KEY} />

          {/* Playlist Display */}
          <div id="playlist">
            <PlaylistDisplay 
              playlist={getRadioState()?.playlist || []} 
              currentTrack={currentTrack} 
            />
          </div>

          {/* FAQ Section */}
          <div id="faq">
            <FAQ />
          </div>
        </div>

        {/* Footer */}
        <Footer />
      </div>
    </div>
  );
}

export default App;
