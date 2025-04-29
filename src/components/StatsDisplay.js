import React, { useState, useEffect } from 'react';
import './StatsDisplay.css';
import { registerListener, unregisterListener, subscribeToStats, cleanupInactiveListeners } from '../services/firebaseService';

/**
 * Component to display radio statistics
 */
const StatsDisplay = ({ playedTracks }) => {
  // Use state to store real listener data from Firebase
  const [listeners, setListeners] = useState(0);
  const [totalListeners, setTotalListeners] = useState(0);

  // Register this listener and subscribe to stats updates
  useEffect(() => {
    // Register this user as a listener
    registerListener().catch(error => {
      console.error('Failed to register listener:', error);
    });

    // Run cleanup once on mount to fix any existing issues with the count
    cleanupInactiveListeners().catch(error => {
      console.error('Failed to clean up inactive listeners:', error);
    });

    // Subscribe to real-time updates on listener stats
    const unsubscribe = subscribeToStats((stats) => {
      setListeners(stats.currentListeners || 0);
      setTotalListeners(stats.totalListeners || 0);
    });

    // Set up periodic cleanup of inactive listeners
    const cleanupInterval = setInterval(() => {
      cleanupInactiveListeners().catch(error => {
        console.error('Failed to clean up inactive listeners:', error);
      });
    }, 60000); // Run every minute

    // Clean up on unmount
    return () => {
      unsubscribe();
      clearInterval(cleanupInterval);
      unregisterListener().catch(error => {
        console.error('Failed to unregister listener:', error);
      });
    };
  }, []);

  return (
    <div className="stats-container">
      <h2>Radio Statistics</h2>
      <div className="stats-grid">
        <div className="stat-item">
          <div className="stat-value">{listeners}</div>
          <div className="stat-label">Current Listeners</div>
        </div>

        <div className="stat-item">
          <div className="stat-value">{playedTracks ? playedTracks.length : 0}</div>
          <div className="stat-label">Songs Played</div>
        </div>

        <div className="stat-item">
          <div className="stat-value">{totalListeners}</div>
          <div className="stat-label">Total Listeners</div>
        </div>
      </div>
    </div>
  );
};

export default StatsDisplay;
