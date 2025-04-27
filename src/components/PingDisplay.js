import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './PingDisplay.css';
import { measureFirebasePing } from '../services/firebaseService';

/**
 * Component to display ping information
 */
const PingDisplay = ({ apiKey }) => {
  const [youtubePing, setYoutubePing] = useState(null);
  const [serverPing, setServerPing] = useState(null);
  const [firebasePing, setFirebasePing] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Function to measure ping to YouTube API
  const measureYoutubePing = async () => {
    try {
      const startTime = Date.now();

      // Make a lightweight call to YouTube API
      await axios.get('https://www.googleapis.com/youtube/v3/videos', {
        params: {
          part: 'id',
          chart: 'mostPopular',
          maxResults: 1,
          key: apiKey
        },
        timeout: 10000 // 10 second timeout
      });

      const endTime = Date.now();
      return endTime - startTime;
    } catch (error) {
      console.error('Error measuring YouTube ping:', error);
      return null;
    }
  };

  // Function to simulate ping to server
  // In a real app, this would ping your actual backend
  const measureServerPing = async () => {
    try {
      const startTime = Date.now();

      // Simulate server ping with a small delay
      await new Promise(resolve => setTimeout(resolve, Math.random() * 50 + 10));

      const endTime = Date.now();
      return endTime - startTime;
    } catch (error) {
      console.error('Error measuring server ping:', error);
      return null;
    }
  };

  // Effect to measure pings on component mount and periodically
  useEffect(() => {
    let isMounted = true;

    const updatePings = async () => {
      try {
        setIsLoading(true);

        // Measure pings
        const [ytPing, srvPing, fbPing] = await Promise.all([
          measureYoutubePing(),
          measureServerPing(),
          measureFirebasePing()
        ]);

        // Only update state if component is still mounted
        if (isMounted) {
          setYoutubePing(ytPing);
          setServerPing(srvPing);
          setFirebasePing(fbPing);
          setError(null);
        }
      } catch (err) {
        if (isMounted) {
          setError('Failed to measure ping');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    // Initial update
    updatePings();

    // Set up interval to update pings every 30 seconds
    const interval = setInterval(updatePings, 30000);

    // Cleanup
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [apiKey]);

  // Helper to format ping display
  const formatPing = (ping) => {
    if (ping === null) return 'N/A';
    return `${ping} ms`;
  };

  return (
    <div className="ping-container">
      <h2>Connection Status</h2>

      {isLoading && <div className="ping-loading">Measuring connection...</div>}

      {error && <div className="ping-error">{error}</div>}

      {!isLoading && !error && (
        <div className="ping-grid">
          <div className="ping-item">
            <div className="ping-label">YouTube API</div>
            <div className={`ping-value ${youtubePing > 200 ? 'ping-slow' : 'ping-good'}`}>
              {formatPing(youtubePing)}
            </div>
          </div>

          <div className="ping-item">
            <div className="ping-label">Server</div>
            <div className={`ping-value ${serverPing > 100 ? 'ping-slow' : 'ping-good'}`}>
              {formatPing(serverPing)}
            </div>
          </div>

          <div className="ping-item">
            <div className="ping-label">Firebase</div>
            <div className={`ping-value ${firebasePing > 150 ? 'ping-slow' : 'ping-good'}`}>
              {formatPing(firebasePing)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PingDisplay;
