import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { getDatabase, ref, push, get, set } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-database.js";
import { config } from '../config.js';

if (!config?.openai?.apiKey) {
    console.error('OpenAI API key is missing from config.js');
} else {
    console.log('OpenAI API key loaded successfully (first 20 chars):', config.openai.apiKey.substring(0, 20) + '...');
}

// Initialize Firebase with config
const app = initializeApp(config.firebase);
const db = getDatabase(app);

// Rate limiting configuration - More conservative settings
const API_CONFIG = {
  MAX_RETRIES: 2,           // Reduce retries to avoid hitting limits
  INITIAL_BACKOFF: 5000,    // 5 seconds initial backoff
  MAX_BACKOFF: 60000,       // 1 minute max backoff
  RATE_LIMIT_REQUESTS: 3,   // Only 3 requests per minute (very conservative)
  RATE_WINDOW: 60000,       // 1 minute in ms
  QUEUE_TIMEOUT: 300000,    // 5 minutes queue timeout
  MIN_REQUEST_INTERVAL: 10000 // Minimum 10 seconds between requests
};

// Queue for tracking API requests
let requestQueue = [];
let lastRequestTimes = [];
let rateLimitedUntil = 0;
let isProcessingQueue = false;
let lastRequestTime = 0; // Track last request time for minimum interval

// Process queued requests
async function processQueue() {
  if (isProcessingQueue) return;
  isProcessingQueue = true;

  while (requestQueue.length > 0) {
    if (!canMakeRequest()) {
      const waitTime = Math.max(
        API_CONFIG.RATE_WINDOW - (Date.now() - lastRequestTimes[0]),
        rateLimitedUntil - Date.now()
      );
      if (waitTime > 0) {
        await wait(waitTime);
      }
    }

    const { operation, resolve, reject, timestamp } = requestQueue[0];
    
    // Remove expired requests
    if (Date.now() - timestamp > API_CONFIG.QUEUE_TIMEOUT) {
      requestQueue.shift();
      reject(new Error('Request expired in queue'));
      continue;
    }

    try {
      const result = await retryWithBackoff(operation);
      requestQueue.shift();
      resolve(result);
    } catch (error) {
      requestQueue.shift();
      reject(error);
    }

    // Small delay between processing queue items
    await wait(100);
  }

  isProcessingQueue = false;
}

// Helper function to implement exponential backoff
async function wait(time) {
  return new Promise(resolve => setTimeout(resolve, time));
}

// Check if we're within rate limits
function canMakeRequest() {
  const now = Date.now();
  
  // Check minimum interval between requests
  if (now - lastRequestTime < API_CONFIG.MIN_REQUEST_INTERVAL) {
    return false;
  }
  
  // Remove requests older than rate window
  lastRequestTimes = lastRequestTimes.filter(time => now - time < API_CONFIG.RATE_WINDOW);
  return lastRequestTimes.length < API_CONFIG.RATE_LIMIT_REQUESTS && now >= rateLimitedUntil;
}

// Add request tracking
function trackRequest() {
  const now = Date.now();
  lastRequestTimes.push(now);
  lastRequestTime = now; // Update last request time
}

// Queue an API request
function queueRequest(operation) {
  return new Promise((resolve, reject) => {
    requestQueue.push({
      operation,
      resolve,
      reject,
      timestamp: Date.now()
    });
    processQueue(); // Start processing if not already running
  });
}

// Update the analyzeSimilarity function
export async function analyzeSimilarity(post1, post2) {
  try {
    console.log('🤖 Starting OpenAI similarity analysis for:', post1.title, 'vs', post2.title);
    
    const text1 = `${post1.title} ${post1.description || ''} ${(post1.labels || []).join(' ')}`;
    const text2 = `${post2.title} ${post2.description || ''} ${(post2.labels || []).join(' ')}`;
    
    console.log('📝 Text analysis inputs:', { text1, text2 });
    
    // Queue the text comparison request
    const textSimilarity = await queueRequest(async () => {
      return await compareTexts(text1, text2);
    });

    console.log('📊 Text similarity result:', textSimilarity);

    // Queue the image comparison request if both posts have images
    let imageSimilarity = { similarity_score: 0 };
    if (post1.imageData && post2.imageData) {
      console.log('🖼️ Starting image comparison...');
      imageSimilarity = await queueRequest(async () => {
        return await compareImages(post1.imageData, post2.imageData);
      });
      console.log('🖼️ Image similarity result:', imageSimilarity);
    } else {
      console.log('🖼️ Skipping image comparison - no images available');
    }

    // Handle various error types
    if (textSimilarity.error === 'rate_limited' || imageSimilarity.error === 'rate_limited') {
      console.warn('⏱️ Rate limit hit in similarity analysis');
      return {
        error: 'rate_limited',
        message: 'OpenAI API rate limit exceeded. Please try again later.',
        retryAfter: rateLimitedUntil
      };
    }

    if (textSimilarity.error === 'quota_exceeded' || imageSimilarity.error === 'quota_exceeded') {
      console.error('💳 Quota exceeded in similarity analysis');
      return {
        error: 'quota_exceeded',
        message: 'OpenAI quota exceeded. Please check your billing.',
        details: textSimilarity.details || imageSimilarity.details
      };
    }

    if (textSimilarity.error === 'auth_failed') {
      console.error('🔐 Authentication failed in similarity analysis');
      return {
        error: 'auth_failed',
        message: 'OpenAI API authentication failed. Please check your API key.'
      };
    }    // Calculate overall score with proper handling
    const textScore = typeof textSimilarity === 'number' ? textSimilarity : 0;
    const imageScore = typeof imageSimilarity.similarity_score === 'number' ? imageSimilarity.similarity_score : 0;
    const overallScore = (textScore + imageScore) / 2;

    console.log('✅ Similarity analysis complete:', {
      textScore,
      imageScore,
      overallScore,
      hasError: !!(textSimilarity.error || imageSimilarity.error)
    });

    return {
      textSimilarity,
      imageSimilarity,
      overallScore
    };
  } catch (error) {
    console.error('❌ Error in similarity analysis:', error);
    return {
      error: 'analysis_error',
      message: 'Error comparing items',
      details: error.message
    };
  }
}

// Retry logic with exponential backoff
async function retryWithBackoff(operation, retries = API_CONFIG.MAX_RETRIES) {
  for (let i = 0; i < retries; i++) {
    try {
      trackRequest();
      const result = await operation();
      
      if (result.error === 'rate_limited') {
        const backoff = Math.min(
          API_CONFIG.INITIAL_BACKOFF * Math.pow(2, i),
          API_CONFIG.MAX_BACKOFF
        );
        rateLimitedUntil = Date.now() + backoff;
        await wait(backoff);
        continue;
      }
      
      return result;
    } catch (error) {
      if (error.status === 429) {
        const backoff = Math.min(
          API_CONFIG.INITIAL_BACKOFF * Math.pow(2, i),
          API_CONFIG.MAX_BACKOFF
        );
        rateLimitedUntil = Date.now() + backoff;
        if (i === retries - 1) {
          return { 
            error: 'rate_limited',
            message: 'OpenAI API rate limit exceeded. Please try again later.',
            retryAfter: rateLimitedUntil
          };
        }
        await wait(backoff);
        continue;
      }
      
      if (i === retries - 1) throw error;
      const backoff = Math.min(
        API_CONFIG.INITIAL_BACKOFF * Math.pow(2, i),
        API_CONFIG.MAX_BACKOFF
      );
      await wait(backoff);
    }
  }
  return { error: 'max_retries', message: 'Maximum retry attempts reached' };
}

async function compareTexts(text1, text2) {
  if (Date.now() < rateLimitedUntil) {
    return { error: 'rate_limited', message: 'OpenAI API rate limit in effect.', retryAfter: rateLimitedUntil };
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.openai.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: [{
          role: "system",
          content: "Compare these two text descriptions and return a similarity score between 0 and 1. Only return the number."
        }, {
          role: "user",
          content: `Text 1: ${text1}\nText 2: ${text2}`
        }]
      })
    });    if (!response.ok) {
      const errorText = await response.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { error: { message: errorText } };
      }

      if (response.status === 429) {
        // Check if it's a quota issue vs rate limit
        if (errorData.error?.code === 'insufficient_quota' || 
            errorData.error?.message?.includes('quota') ||
            errorData.error?.message?.includes('billing')) {
          return { 
            error: 'quota_exceeded', 
            message: '❌ OpenAI quota exceeded. Please check your billing and usage limits at https://platform.openai.com/account/billing',
            details: errorData.error?.message
          };
        }
        
        // Regular rate limiting
        const retryAfter = response.headers.get('retry-after');
        rateLimitedUntil = Date.now() + (retryAfter ? parseInt(retryAfter) * 1000 : API_CONFIG.RATE_WINDOW);
        return { 
          error: 'rate_limited', 
          message: 'OpenAI API rate limit exceeded. Please try again later.',
          retryAfter: rateLimitedUntil,
          details: errorData.error?.message
        };
      }
      
      if (response.status === 401) {
        return { 
          error: 'auth_failed', 
          message: 'OpenAI API authentication failed. Please check your API key.',
          details: errorData.error?.message
        };
      }
      
      if (response.status === 404) {
        return { error: 'not_found', message: 'OpenAI API endpoint not found.' };
      }
      
      return { 
        error: 'api_error', 
        message: `OpenAI API error: ${response.status}`,
        details: errorData.error?.message
      };
    }

    const data = await response.json();
    if (!data.choices?.[0]?.message?.content) {
      return { error: 'malformed_response', message: 'Malformed response from OpenAI API.' };
    }
    
    const score = parseFloat(data.choices[0].message.content);
    if (isNaN(score)) {
      return { error: 'malformed_response', message: 'OpenAI did not return a valid score.' };
    }
    
    return Math.min(Math.max(score, 0), 1); // Ensure score is between 0 and 1
  } catch (error) {
    console.error('Error comparing texts:', error);
    if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') {
      rateLimitedUntil = Date.now() + API_CONFIG.INITIAL_BACKOFF;
      return { 
        error: 'rate_limited', 
        message: 'Network timeout, possibly due to rate limiting.',
        retryAfter: rateLimitedUntil
      };
    }
    return { error: 'network_error', message: 'Network or unexpected error comparing texts.' };
  }
}

async function compareImages(imageUrl1, imageUrl2) {
  // Skip image comparison for now due to API issues - return default response
  console.warn('Image comparison skipped due to API limitations');
  return { 
    error: 'not_supported', 
    message: 'Image comparison temporarily disabled due to API limitations',
    similarity_score: 0.1 // Default low similarity for images
  };
}