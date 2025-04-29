import { initializeApp } from 'firebase/app';
import { getDatabase, ref, onValue, set, increment, serverTimestamp, get } from 'firebase/database';

// Firebase configuration
// Replace with your own Firebase config
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.REACT_APP_FIREBASE_DATABASE_URL,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID
};

// Initialize Firebase
export const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

// Generate a unique ID for this session
const sessionId = Date.now().toString(36) + Math.random().toString(36).substring(2);

/**
 * Register a new listener when the app loads
 * This will increment the current listeners count and total listeners count
 */
export const registerListener = async () => {
  try {
    // Reference to the stats in the database
    const statsRef = ref(database, 'stats');

    // Get current stats
    const snapshot = await get(statsRef);
    const stats = snapshot.exists() ? snapshot.val() : { currentListeners: 0, totalListeners: 0 };

    // Store the session ID to track this listener
    await set(ref(database, `listeners/${sessionId}`), {
      timestamp: serverTimestamp(),
      active: true
    });

    // Count active listeners to ensure accuracy
    const listenersRef = ref(database, 'listeners');
    const listenersSnapshot = await get(listenersRef);
    let activeListenersCount = 0;

    if (listenersSnapshot.exists()) {
      const listeners = listenersSnapshot.val();
      // Count only active listeners
      Object.values(listeners).forEach(listener => {
        if (listener.active === true) {
          activeListenersCount++;
        }
      });
    }

    // Update stats with accurate count
    await set(statsRef, {
      currentListeners: activeListenersCount,
      totalListeners: stats.totalListeners + 1,
      lastUpdated: serverTimestamp()
    });

    // Set up cleanup on window close/refresh
    window.addEventListener('beforeunload', unregisterListener);

    return true;
  } catch (error) {
    console.error('Error registering listener:', error);
    return false;
  }
};

/**
 * Unregister a listener when they leave
 * This will update the current listeners count based on active listeners
 */
export const unregisterListener = async () => {
  try {
    // Mark this listener as inactive
    await set(ref(database, `listeners/${sessionId}/active`), false);

    // Count active listeners to ensure accuracy
    const listenersRef = ref(database, 'listeners');
    const listenersSnapshot = await get(listenersRef);
    let activeListenersCount = 0;

    if (listenersSnapshot.exists()) {
      const listeners = listenersSnapshot.val();
      // Count only active listeners
      Object.values(listeners).forEach(listener => {
        if (listener.active === true) {
          activeListenersCount++;
        }
      });
    }

    // Update stats with accurate count
    const statsRef = ref(database, 'stats/currentListeners');
    await set(statsRef, activeListenersCount);

    return true;
  } catch (error) {
    console.error('Error unregistering listener:', error);
    return false;
  }
};

/**
 * Get real-time updates on listener stats
 * @param {Function} callback - Function to call with updated stats
 * @returns {Function} - Unsubscribe function
 */
export const subscribeToStats = (callback) => {
  const statsRef = ref(database, 'stats');

  // Listen for changes to the stats
  const unsubscribe = onValue(statsRef, (snapshot) => {
    const stats = snapshot.exists() ? snapshot.val() : { currentListeners: 0, totalListeners: 0 };
    callback(stats);
  });

  return unsubscribe;
};

/**
 * Measure ping to Firebase
 * @returns {Promise<number|null>} - Ping time in milliseconds or null if error
 */
export const measureFirebasePing = async () => {
  try {
    const startTime = Date.now();

    // Make a lightweight call to Firebase
    const pingRef = ref(database, 'ping');
    await set(pingRef, {
      timestamp: serverTimestamp()
    });

    const endTime = Date.now();
    return endTime - startTime;
  } catch (error) {
    console.error('Error measuring Firebase ping:', error);
    return null;
  }
};

/**
 * Check if Firebase is accessible
 * @returns {Promise<Object>} - Result of the check
 */
export const checkFirebaseAccess = async () => {
  try {
    // Try to access Firebase
    const pingRef = ref(database, 'ping');
    await set(pingRef, {
      timestamp: serverTimestamp()
    });

    return { success: true, message: 'Firebase is accessible' };
  } catch (error) {
    console.error('Firebase access check failed:', error);
    return { success: false, message: 'Unable to access Firebase. It may be blocked or down.' };
  }
};

/**
 * Clean up inactive listeners and update the current listeners count
 * This helps handle cases where the beforeunload event doesn't fire
 * @returns {Promise<boolean>} - Whether the cleanup was successful
 */
export const cleanupInactiveListeners = async () => {
  try {
    // Get all listeners
    const listenersRef = ref(database, 'listeners');
    const listenersSnapshot = await get(listenersRef);

    if (!listenersSnapshot.exists()) {
      return true;
    }

    const listeners = listenersSnapshot.val();
    let activeListenersCount = 0;
    const now = Date.now();
    const INACTIVE_THRESHOLD = 5 * 60 * 1000; // 5 minutes in milliseconds

    // Process each listener
    for (const [id, listener] of Object.entries(listeners)) {
      if (listener.active === true) {
        // Check if the listener has a timestamp
        if (listener.timestamp) {
          const listenerTime = new Date(listener.timestamp).getTime();
          // If the listener hasn't updated in the threshold time, mark as inactive
          if (now - listenerTime > INACTIVE_THRESHOLD) {
            await set(ref(database, `listeners/${id}/active`), false);
          } else {
            activeListenersCount++;
          }
        } else {
          activeListenersCount++;
        }
      }
    }

    // Update the current listeners count
    const statsRef = ref(database, 'stats/currentListeners');
    await set(statsRef, activeListenersCount);

    return true;
  } catch (error) {
    console.error('Error cleaning up inactive listeners:', error);
    return false;
  }
};
