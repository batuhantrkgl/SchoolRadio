import axios from 'axios';
import { fetchPlaylistItems } from './youtubeService';
import { checkFirebaseAccess } from './firebaseService';

/**
 * Service to check various connectivity and API requirements
 */

// Test if the service can connect to the internet using the YouTube API
// This avoids CORS issues since the API supports cross-origin requests
export const checkInternetConnection = async (apiKey) => {
  try {
    // Use the YouTube API instead of a direct domain check to avoid CORS issues
    if (!apiKey) {
      return { success: false, message: 'Cannot check internet connection without API key' };
    }

    // Try a lightweight call to the YouTube API
    await axios.get('https://www.googleapis.com/youtube/v3/videos', {
      params: {
        part: 'id',
        chart: 'mostPopular',
        maxResults: 1,
        key: apiKey
      },
      timeout: 5000
    });

    return { success: true, message: 'Connected to the internet' };
  } catch (error) {
    console.error('Internet connection check failed:', error);
    // Network error indicates no internet
    if (error.code === 'ERR_NETWORK') {
      return { success: false, message: 'No internet connection detected' };
    }
    // If we get any response, even an error one, internet is working
    return { success: true, message: 'Internet connection available (detected via API response)' };
  }
};

// Test if YouTube is accessible via the API
export const checkYouTubeAccess = async (apiKey) => {
  try {
    if (!apiKey) {
      return { success: false, message: 'Cannot check YouTube access without API key' };
    }

    // Use the YouTube Data API instead of direct website access
    const result = await axios.get('https://www.googleapis.com/youtube/v3/videos', {
      params: {
        part: 'id',
        chart: 'mostPopular',
        maxResults: 1,
        key: apiKey
      },
      timeout: 5000
    });

    // Any valid response means YouTube services are accessible
    if (result.status >= 200 && result.status < 300) {
      return { success: true, message: 'YouTube API is accessible' };
    }

    return { success: false, message: `YouTube API returned status ${result.status}` };
  } catch (error) {
    console.error('YouTube access check failed:', error);
    // If we got a 403, it might be an API key issue, not an access issue
    if (error.response && error.response.status === 403) {
      return { success: true, message: 'YouTube API is reachable (but API key may be invalid)' };
    }
    return { success: false, message: 'Unable to access YouTube API. It may be blocked or down.' };
  }
};

// Test if the YouTube API key works
export const checkAPIKey = async (apiKey) => {
  try {
    if (!apiKey) {
      return { success: false, message: 'No API key provided' };
    }

    // Make a simple API call that would fail with invalid key
    const result = await axios.get('https://www.googleapis.com/youtube/v3/videos', {
      params: {
        part: 'snippet',
        chart: 'mostPopular',
        maxResults: 1,
        key: apiKey
      },
      timeout: 5000
    });

    // Check if we got a valid response
    if (result.status >= 200 && result.status < 300) {
      return { success: true, message: 'API key is valid' };
    }

    return { success: false, message: `API returned unexpected status: ${result.status}` };
  } catch (error) {
    console.error('API key check failed:', error);
    if (error.response && error.response.status === 403) {
      return { success: false, message: 'API key is invalid or quota exceeded' };
    }
    return { success: false, message: 'Unable to validate API key' };
  }
};

// Test if the playlist exists and is accessible
export const checkPlaylistExists = async (apiKey, playlistId) => {
  try {
    if (!apiKey || !playlistId) {
      return { success: false, message: 'API key or Playlist ID missing' };
    }

    const items = await fetchPlaylistItems(apiKey, playlistId, 1);
    if (items && items.length > 0) {
      return { success: true, message: 'Playlist exists and contains videos' };
    } else {
      return { 
        success: false, 
        message: 'Playlist exists but contains no videos or is not accessible'
      };
    }
  } catch (error) {
    console.error('Playlist check failed:', error);
    if (error.response && error.response.status === 404) {
      return { success: false, message: 'Playlist does not exist' };
    }
    return { 
      success: false, 
      message: 'Unable to check playlist: ' + (error.message || 'Unknown error')
    };
  }
};

// Check if this PC can run the server (system requirements)
export const checkSystemCompatibility = () => {
  try {
    // Basic check - if JavaScript can run, the system is likely compatible
    // More advanced checks could be added for memory, disk space, etc.
    const isCompatible = true;
    const browserInfo = navigator.userAgent;
    const memoryInfo = window.performance && window.performance.memory ? 
      `Available memory: ${Math.round(window.performance.memory.jsHeapSizeLimit / 1024 / 1024)}MB` : 
      'Memory info unavailable';

    return { 
      success: isCompatible, 
      message: `System appears compatible. Browser: ${browserInfo}. ${memoryInfo}`,
      details: {
        browser: browserInfo,
        memory: memoryInfo,
        platform: navigator.platform,
        cookiesEnabled: navigator.cookieEnabled,
        language: navigator.language
      }
    };
  } catch (error) {
    console.error('System compatibility check failed:', error);
    return { success: false, message: 'Error checking system compatibility' };
  }
};

// Run all checks at once
export const runAllDiagnostics = async (apiKey, playlistId) => {
  const results = {
    internet: await checkInternetConnection(apiKey),
    youtube: await checkYouTubeAccess(apiKey),
    apiKey: await checkAPIKey(apiKey),
    playlist: await checkPlaylistExists(apiKey, playlistId),
    firebase: await checkFirebaseAccess(),
    system: checkSystemCompatibility()
  };

  // Determine if essential checks passed
  // Note: We don't require internet/youtube checks to pass since they might
  // have CORS issues in local development
  const criticalChecks = ['apiKey', 'playlist', 'firebase', 'system'];
  const criticalPassed = criticalChecks.every(check => results[check].success);

  return {
    results,
    allPassed: Object.values(results).every(check => check.success),
    criticalPassed: criticalPassed,
    summary: criticalPassed 
      ? 'All critical diagnostics passed' 
      : 'Some critical diagnostics failed'
  };
};
