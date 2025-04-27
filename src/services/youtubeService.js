import axios from 'axios';

/**
 * Fetches videos from a YouTube playlist
 * @param {string} apiKey - YouTube Data API key
 * @param {string} playlistId - YouTube playlist ID
 * @param {number} maxResults - Maximum number of videos to fetch (default: 50)
 * @returns {Promise<Array>} - Array of playlist items with content details
 */
export const fetchPlaylistItems = async (apiKey, playlistId, maxResults = 50) => {
  try {
    // First, fetch the playlist items to get the video IDs
    const response = await axios.get('https://www.googleapis.com/youtube/v3/playlistItems', {
      params: {
        part: 'snippet',
        maxResults: maxResults,
        playlistId: playlistId,
        key: apiKey
      }
    });

    const playlistItems = response.data.items;

    // If no items found, return empty array
    if (!playlistItems || playlistItems.length === 0) {
      return [];
    }

    // Extract video IDs from playlist items
    const videoIds = playlistItems.map(item => item.snippet.resourceId.videoId).join(',');

    // Fetch video details including contentDetails for all videos in one request
    const videoDetailsResponse = await axios.get('https://www.googleapis.com/youtube/v3/videos', {
      params: {
        part: 'contentDetails',
        id: videoIds,
        key: apiKey
      }
    });

    const videoDetails = videoDetailsResponse.data.items;

    // Create a map of video IDs to their content details
    const videoDetailsMap = {};
    videoDetails.forEach(video => {
      videoDetailsMap[video.id] = video.contentDetails;
    });

    // Merge content details into playlist items
    const enhancedPlaylistItems = playlistItems.map(item => {
      const videoId = item.snippet.resourceId.videoId;
      return {
        ...item,
        contentDetails: videoDetailsMap[videoId] || {}
      };
    });

    return enhancedPlaylistItems;
  } catch (error) {
    console.error('Error fetching YouTube playlist:', error);
    throw error;
  }
};

/**
 * Gets video details by video ID
 * @param {string} apiKey - YouTube Data API key
 * @param {string} videoId - YouTube video ID
 * @returns {Promise<Object>} - Video details
 */
export const getVideoDetails = async (apiKey, videoId) => {
  try {
    const response = await axios.get('https://www.googleapis.com/youtube/v3/videos', {
      params: {
        part: 'snippet,contentDetails,statistics',
        id: videoId,
        key: apiKey
      }
    });

    return response.data.items[0];
  } catch (error) {
    console.error('Error fetching video details:', error);
    throw error;
  }
};
