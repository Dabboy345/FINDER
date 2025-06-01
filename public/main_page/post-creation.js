import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";
import { getDatabase, ref, push, get, set, onValue, update } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyBmS-i8N6sFOB4khvIpX-_fFN3ITebSS0g",
  authDomain: "finder-ff519.firebaseapp.com",
  databaseURL: "https://finder-ff519-default-rtdb.europe-west1.firebasedatabase.app/",
  projectId: "finder-ff519",
  storageBucket: "finder-ff519.appspot.com",
  messagingSenderId: "989218762868",
  appId: "1:989218762868:web:7f5160caf34ddccd92e121"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

let currentUser = null;
let postType = 'lost'; // Default post type

// Multilingual dictionary for semantic matching
const multilingualDictionary = {
  // Electronics
  'phone': ['telefono', 'movil', 'movil', 'celular', 'telefon'],
  'telefono': ['phone', 'movil', 'celular', 'telefon'],
  'movil': ['phone', 'telefono', 'celular', 'telefon'],
  'laptop': ['portatil', 'ordinador', 'computadora'],
  'portatil': ['laptop', 'ordinador', 'computadora'],
  'headphones': ['auriculares', 'cascos', 'auriculars'],
  'auriculares': ['headphones', 'cascos', 'auriculars'],
  'charger': ['cargador', 'carregador'],
  'cargador': ['charger', 'carregador'],
  
  // Personal items
  'bag': ['bolso', 'bolsa', 'mochila', 'motxilla'],
  'bolso': ['bag', 'bolsa', 'mochila', 'motxilla'],
  'mochila': ['bag', 'bolso', 'bolsa', 'motxilla'],
  'motxilla': ['bag', 'bolso', 'mochila', 'bolsa'],
  'wallet': ['cartera', 'billetera', 'monedero'],
  'cartera': ['wallet', 'billetera', 'monedero'],
  'billetera': ['wallet', 'cartera', 'monedero'],
  'keys': ['llaves', 'claves', 'claus'],
  'llaves': ['keys', 'claves', 'claus'],
  'claus': ['keys', 'llaves', 'claves'],
  'watch': ['reloj', 'montre'],
  'reloj': ['watch', 'montre'],
  'glasses': ['gafas', 'anteojos', 'ulleres'],
  'gafas': ['glasses', 'anteojos', 'ulleres'],
  'ulleres': ['glasses', 'gafas', 'anteojos'],
  
  // Books and study materials
  'book': ['libro', 'llibre', 'livre'],
  'libro': ['book', 'llibre', 'livre'],
  'llibre': ['book', 'libro', 'livre'],
  'notebook': ['cuaderno', 'libreta', 'quadern'],
  'cuaderno': ['notebook', 'libreta', 'quadern'],
  'quadern': ['notebook', 'cuaderno', 'libreta'],
  
  // Common descriptive words
  'lost': ['perdido', 'perdut', 'perdu'],
  'found': ['encontrado', 'trobat', 'trouvé'],
  'small': ['pequeño', 'petit', 'petite'],
  'big': ['grande', 'gran', 'grand'],
  'new': ['nuevo', 'nou', 'nouveau'],
  'old': ['viejo', 'vell', 'vieux']
};

// Calculate local similarity between two posts
function calculateLocalSimilarity(post1, post2) {
  const scores = {
    labelMatch: 0,
    semanticMatch: 0,
    textSimilarity: 0,
    locationMatch: 0,
    total: 0
  };
  
  // Get text content for both posts
  const text1 = `${post1.title || ''} ${post1.description || ''}`.toLowerCase();
  const text2 = `${post2.title || ''} ${post2.description || ''}`.toLowerCase();
  const labels1 = (post1.labels || []).map(l => l.toLowerCase());
  const labels2 = (post2.labels || []).map(l => l.toLowerCase());
  
  // 1. Direct label matching (30% weight)
  const directMatches = labels1.filter(l => 
    l !== 'lost' && l !== 'found' && labels2.includes(l)
  );
  scores.labelMatch = directMatches.length > 0 ? 0.3 : 0;
  
  // 2. Semantic/multilingual matching (40% weight)
  let semanticMatches = 0;
  for (const label1 of labels1) {
    if (label1 === 'lost' || label1 === 'found') continue;
    
    // Check direct translations
    const translations = multilingualDictionary[label1] || [];
    const hasTranslation = labels2.some(l2 => translations.includes(l2));
    if (hasTranslation) semanticMatches++;
    
    // Check if any label2 translates to label1
    for (const label2 of labels2) {
      if (label2 === 'lost' || label2 === 'found') continue;
      const reverseTranslations = multilingualDictionary[label2] || [];
      if (reverseTranslations.includes(label1)) {
        semanticMatches++;
        break;
      }
    }
  }
  
  // Also check text content for semantic matches
  for (const [word, translations] of Object.entries(multilingualDictionary)) {
    if (text1.includes(word)) {
      for (const translation of translations) {
        if (text2.includes(translation)) {
          semanticMatches++;
          break;
        }
      }
    }
  }
  
  scores.semanticMatch = semanticMatches > 0 ? Math.min(semanticMatches * 0.1, 0.4) : 0;
  
  // 3. Text similarity (20% weight)
  const words1 = text1.split(/\s+/).filter(w => w.length > 2);
  const words2 = text2.split(/\s+/).filter(w => w.length > 2);
  const commonWords = words1.filter(w => words2.includes(w));
  
  if (words1.length > 0 && words2.length > 0) {
    const similarity = commonWords.length / Math.max(words1.length, words2.length);
    scores.textSimilarity = similarity * 0.2;
  }
  
  // 4. Location proximity (10% weight)
  if (post1.location && post2.location) {
    const loc1 = post1.location.toLowerCase();
    const loc2 = post2.location.toLowerCase();
    
    // Exact location match
    if (loc1 === loc2) {
      scores.locationMatch = 0.1;
    }
    // Partial location match
    else if (loc1.includes(loc2) || loc2.includes(loc1)) {
      scores.locationMatch = 0.05;
    }
    // Common location keywords
    else {
      const locationKeywords = ['campus', 'biblioteca', 'library', 'cafeteria', 'aula', 'classroom'];
      const hasCommonLocation = locationKeywords.some(keyword => 
        loc1.includes(keyword) && loc2.includes(keyword)
      );
      if (hasCommonLocation) scores.locationMatch = 0.03;
    }
  }
  
  // Calculate total score
  scores.total = scores.labelMatch + scores.semanticMatch + scores.textSimilarity + scores.locationMatch;
  
  return {
    score: scores.total,
    confidence: Math.round(scores.total * 100),
    breakdown: scores,
    directMatches,
    semanticMatches
  };
}

// Check authentication state
onAuthStateChanged(auth, (user) => {
  if (user) {
    currentUser = user;
  } else {
    window.location.href = '../index.html';
  }
});

// Handle post type selection
const typeButtons = document.querySelectorAll('.type-btn');
typeButtons.forEach(button => {
  button.addEventListener('click', () => {
    typeButtons.forEach(btn => btn.classList.remove('active'));
    button.classList.add('active');
    postType = button.dataset.type;
  });
});

// Handle image preview
const imageInput = document.getElementById('image');
const imagePreview = document.getElementById('imagePreview');
const uploadPlaceholder = document.querySelector('.upload-placeholder');

imageInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      imagePreview.src = e.target.result;
      imagePreview.style.display = 'block';
      uploadPlaceholder.style.display = 'none';
    };
    reader.readAsDataURL(file);
  }
});

// Helper: Upload image file to imgbb and return the image URL
async function uploadImageToImgbb(file) {
  const apiKey = '7f5b86f1efb5c249bafe472c9078a76d'; // <-- Replace with your imgbb API key
  const formData = new FormData();
  formData.append('image', file);
  formData.append('key', apiKey);

  const response = await fetch('https://api.imgbb.com/1/upload', {
    method: 'POST',
    body: formData
  });
  const data = await response.json();
  if (data && data.success && data.data && data.data.url) {
    return data.data.url;
  } else {
    throw new Error('Image upload failed');
  }
}

// Handle form submission
const postForm = document.getElementById('postForm');
postForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const title = document.getElementById('title').value;
  const description = document.getElementById('description').value;
  let labels = document.getElementById('labels').value
    .split(',')
    .map(label => label.trim())
    .filter(Boolean);

  // Ensure the selected post type ("lost" or "found") is included as a label
  if (!labels.map(l => l.toLowerCase()).includes(postType)) {
    labels.unshift(postType);
  }

  // Get the file from the input
  const file = imageInput.files[0];
  if (!file) {
    alert('Please select an image.');
    return;
  }

  try {
    // Upload image to imgbb and get the URL
    const imageUrl = await uploadImageToImgbb(file);

    // Create post object
    const post = {
      title,
      description,
      labels,
      imageData: imageUrl,
      type: postType,
      timestamp: Date.now(),
      user: {
        uid: currentUser.uid,
        email: currentUser.email
      },
      claimed: false
    };

    // Save to Firebase
    const newPostRef = await push(ref(db, 'posts'), post);

    // Find matches
    const postsSnapshot = await get(ref(db, 'posts'));
    const postsData = postsSnapshot.val();
    
    if (postsData) {
      for (const [otherPostId, otherPost] of Object.entries(postsData)) {
        // Skip invalid comparisons
        if (otherPostId === newPostRef.key || !otherPost.labels || 
            otherPost.type === post.type) continue;

        try {
          // Use local similarity analysis
          const similarity = calculateLocalSimilarity(post, otherPost);
          
          if (similarity.confidence >= 70) {
            // Create notification for match
            await push(ref(db, 'notifications'), {
              to: otherPost.user.uid,
              title: 'Found a Potential Match!',
              message: `Match confidence: ${similarity.confidence}%\nFor your ${otherPost.type} post: "${otherPost.title}"`,
              type: 'match',
              postId: newPostRef.key,
              matchedWithId: otherPostId,
              matchConfidence: similarity.confidence / 100,
              timestamp: Date.now(),
              read: false
            });
          }
        } catch (error) {
          console.error('Error analyzing match:', error);
        }
      }
    }

    // Redirect to main page
    window.location.href = 'main_page.html';
  } catch (error) {
    console.error('Error creating post:', error);
    alert('Error creating post. Please try again.');
  }
});

// Handle logout
document.getElementById('logoutBtn').addEventListener('click', async (e) => {
  e.preventDefault();
  try {
    await signOut(auth);
    window.location.href = '../index.html';
  } catch (error) {
    console.error('Error signing out:', error);
    alert('Error signing out. Please try again.');
  }
});

// Handle logo click - redirect to main page
const logoElement = document.querySelector('.logo');
if (logoElement) {
  logoElement.addEventListener('click', () => {
    window.location.href = './main_page.html';
  });
}

// --- Notification Dropdown Logic (EXACTLY like main_page.js) ---

const notificationContainer = document.querySelector('.notification-container');
let notificationDropdown = notificationContainer.querySelector('.notification-dropdown');
if (!notificationDropdown) {
  notificationDropdown = document.createElement('div');
  notificationDropdown.className = 'notification-dropdown';
  notificationContainer.appendChild(notificationDropdown);
}

let unreadNotifications = 0;

function updateNotificationBadge(count) {
  const badge = document.getElementById('notificationBadge');
  if (count > 0) {
    badge.style.display = 'block';
    badge.textContent = count;
  } else {
    badge.style.display = 'none';
  }
}

function listenForNotifications(userId) {
  const notificationsRef = ref(db, 'notifications');
  onValue(notificationsRef, (snapshot) => {
    const data = snapshot.val();
    if (!data) {
      updateNotificationBadge(0);
      return;
    }
    const unread = Object.values(data)
      .filter(n => n.to === userId && !n.read)
      .length;
    updateNotificationBadge(unread);
  });
}

async function loadNotifications() {
  if (!currentUser) return;
  const notificationsRef = ref(db, 'notifications');
  const snapshot = await get(notificationsRef);
  const data = snapshot.val();
  if (!data) {
    notificationDropdown.innerHTML = '<div class="notification-item">No notifications</div>';
    return;
  }
  const notifications = Object.entries(data)
    .filter(([, n]) => n.to === currentUser.uid)
    .sort(([, a], [, b]) => (b.lastUpdated || b.timestamp || 0) - (a.lastUpdated || a.timestamp || 0));
  notificationDropdown.innerHTML = notifications.map(([id, notification]) => {
    const timeString = new Date(notification.lastUpdated || notification.timestamp).toLocaleString();
    return `
      <div class="notification-item ${notification.read ? '' : 'unread'}" data-id="${id}">
        <div class="notification-title">
          <i class="fas ${notification.type === 'claim' ? 'fa-hand-holding' : 'fa-tag'}"></i>
          ${notification.title}
        </div>
        <div class="notification-message">${notification.message}</div>
        <div class="notification-time">${timeString}</div>
      </div>
    `;
  }).join('');

  notificationDropdown.querySelectorAll('.notification-item').forEach(item => {
    item.addEventListener('click', async () => {
      const notificationId = item.dataset.id;
      await set(ref(db, `notifications/${notificationId}/read`), true);
      item.classList.remove('unread');
      const notification = data[notificationId];
      if (notification.type === 'match' && notification.postId && notification.matchedWithId) {
        window.location.href = `post-details.html?id=${encodeURIComponent(notification.postId)}&matchedWith=${encodeURIComponent(notification.matchedWithId)}`;
      } else if (notification.postId) {
        window.location.href = `post-details.html?id=${encodeURIComponent(notification.postId)}`;
      }
    });
  });
}

notificationContainer.addEventListener('click', (e) => {
  if (e.target.closest('.notification-dropdown')) return;
  notificationDropdown.classList.toggle('show');
  if (notificationDropdown.classList.contains('show')) {
    loadNotifications();
  }
});

document.addEventListener('click', (e) => {
  if (!notificationContainer.contains(e.target) && !notificationDropdown.contains(e.target)) {
    notificationDropdown.classList.remove('show');
  }
});

onAuthStateChanged(auth, (user) => {
  currentUser = user;
  if (user) {
    listenForNotifications(user.uid);
  }
});

// Notification container HTML
const notificationContainerHTML = `
  <div class="notification-container">
    <i class="fas fa-bell"></i>
    <span id="notificationBadge">0</span>
  </div>
`;

// Insert notification container HTML into the page
document.body.insertAdjacentHTML('afterbegin', notificationContainerHTML);

// Enhanced notification detail display function
async function showNotificationDetail(notification) {
  // Set the notification ID for the delete button
  document.getElementById('deleteNotificationBtn').dataset.notificationId = notification.id;

  // Build structured notification content
  let html = `
    <div class="notification-overview">
      <div class="notification-meta">
        <div class="meta-item">
          <div class="meta-label">Notification Type</div>
          <div class="meta-value">
            <span class="notification-type-badge ${notification.type}">
              <i class="fas ${getNotificationIcon(notification.type)}"></i>
              ${notification.type.charAt(0).toUpperCase() + notification.type.slice(1)}
            </span>
          </div>
        </div>
        <div class="meta-item">
          <div class="meta-label">Created</div>
          <div class="meta-value">${formatDate(notification.timestamp)}</div>
        </div>
        <div class="meta-item">
          <div class="meta-label">Last Updated</div>
          <div class="meta-value">${formatDate(notification.lastUpdated || notification.timestamp)}</div>
        </div>
        <div class="meta-item">
          <div class="meta-label">Status</div>
          <div class="meta-value">
            <span style="color: ${notification.read ? '#27ae60' : '#e74c3c'};">
              <i class="fas ${notification.read ? 'fa-check-circle' : 'fa-circle'}"></i>
              ${notification.read ? 'Read' : 'Unread'}
            </span>
          </div>
        </div>
      </div>
      
      <div class="notification-content">
        <h3 style="margin-bottom: 0.5rem; color: #2c3e50;">
          <i class="fas ${getNotificationIcon(notification.type)}" style="color: #3498db; margin-right: 0.5rem;"></i>
          ${escapeHtml(notification.title)}
        </h3>
        <p style="color: #7f8c8d; margin-bottom: 1rem;">${escapeHtml(notification.message)}</p>
      </div>
    </div>
  `;

  // Add claims section for claim notifications
  if (notification.claims && notification.claims.length > 0) {
    html += `
      <div class="claims-section">
        <h3>
          <i class="fas fa-hand-holding"></i>
          Claim Messages (${notification.claims.length})
        </h3>
        <div class="claims-list">
          ${notification.claims.map(claim => `
            <div class="claim-item">
              <div class="claim-header">
                <div class="claim-sender">
                  <i class="fas fa-user"></i>
                  ${escapeHtml(claim.from?.email || 'Unknown User')}
                </div>
                <div class="claim-time">${formatDate(claim.timestamp)}</div>
              </div>
              <div class="claim-message">${formatMessage(claim.message || '')}</div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  // Add post details section
  if (notification.postId) {
    const post = await getPostById(notification.postId);
    let matchedWithPost = null;
    if (notification.matchedWithId) {
      matchedWithPost = await getPostById(notification.matchedWithId);
    }

    if (post || matchedWithPost) {
      html += `<div class="post-details-section">`;
      
      if (post && matchedWithPost) {
        // Match notification - show both posts
        html += `
          <h3 style="margin-bottom: 1rem; color: #2c3e50;">
            <i class="fas fa-link"></i>
            Related Posts
          </h3>
          <div class="post-comparison">
            <div class="post-card">
              <h4>
                <i class="fas fa-search"></i>
                Your Post
              </h4>
              ${generatePostCardContent(matchedWithPost)}
            </div>
            <div class="post-card">
              <h4>
                <i class="fas fa-bullseye"></i>
                Matched Post
              </h4>
              ${generatePostCardContent(post)}
            </div>
          </div>
        `;
      } else if (post) {
        // Single post notification
        html += `
          <h3 style="margin-bottom: 1rem; color: #2c3e50;">
            <i class="fas fa-file-alt"></i>
            Related Post
          </h3>
          <div class="post-card">
            ${generatePostCardContent(post)}
          </div>
        `;
      }
      
      html += `</div>`;
    }
  }

  // Add action buttons
  html += `
    <div class="notification-actions">
      ${notification.postId ? `
        <a href="post-details.html?id=${encodeURIComponent(notification.postId)}${notification.matchedWithId ? `&matchedWith=${encodeURIComponent(notification.matchedWithId)}` : ''}" 
           class="btn btn-primary">
          <i class="fas fa-eye"></i>
          View Post Details
        </a>
      ` : ''}
      ${notification.type === 'claim' && notification.claims && notification.claims.length > 0 ? `
        <button onclick="replyToLatestClaim('${notification.id}')" class="btn btn-secondary">
          <i class="fas fa-reply"></i>
          Reply to Claim
        </button>
      ` : ''}
    </div>
  `;

  document.getElementById('notificationDetailBody').innerHTML = html;
}

// Helper function to get notification type icon
function getNotificationIcon(type) {
  const icons = {
    'claim': 'fa-hand-holding',
    'chat': 'fa-comments',
    'match': 'fa-link',
    'tag': 'fa-tag'
  };
  return icons[type] || 'fa-bell';
}

// Helper function to generate post card content
function generatePostCardContent(post) {
  if (!post) return '<p style="color: #7f8c8d;">Post details unavailable</p>';
  
  return `
    <div class="post-title">${escapeHtml(post.title || 'Untitled')}</div>
    ${post.imageData ? `
      <img src="${post.imageData}" alt="${escapeHtml(post.title || 'Post image')}" 
           class="post-image" 
           onerror="this.style.display='none';" />
    ` : ''}
    ${post.description ? `
      <div class="post-description">${formatMessage(post.description)}</div>
    ` : ''}
    ${post.labels && post.labels.length ? `
      <div class="post-labels">
        ${post.labels.map(label => `<span class="label">${escapeHtml(label)}</span>`).join('')}
      </div>
    ` : ''}
    <div class="post-author">
      <i class="fas fa-user"></i>
      Posted by ${escapeHtml(post.user?.email || 'Unknown User')}
    </div>
  `;
}

// Helper function to reply to latest claim (placeholder for future implementation)
function replyToLatestClaim(notificationId) {
  // This could open a reply modal or redirect to a chat
  alert('Reply functionality will be implemented in a future update.');
}

// Helper function to format dates consistently
function formatDate(timestamp) {
  if (!timestamp) return 'Unknown';
  const date = new Date(timestamp);
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// Helper function to format messages with line breaks
function formatMessage(message) {
  if (!message) return '';
  return escapeHtml(message).replace(/\n/g, '<br>');
}

// Helper function to fetch post details by postId
async function getPostById(postId) {
  if (!postId) return null;
  try {
    const postSnapshot = await get(ref(db, `posts/${postId}`));
    return postSnapshot.val();
  } catch (error) {
    console.error('Error fetching post:', error);
    return null;
  }
}

// Enhanced notification click handler
function setupNotificationClickHandler() {
  document.querySelectorAll('.notification-item').forEach(item => {
    item.addEventListener('click', async function() {
      const notificationId = this.dataset.id;
      const notificationsRef = ref(db, 'notifications');
      const snapshot = await get(notificationsRef);
      const data = snapshot.val();
      
      if (data && data[notificationId]) {
        const notification = { ...data[notificationId], id: notificationId };
        
        // Mark as read
        await update(ref(db, `notifications/${notificationId}`), { read: true });
        
        // Show detailed notification
        await showNotificationDetail(notification);
        const notificationDetailModal = document.getElementById('notificationDetailModal');
        if (notificationDetailModal) {
          notificationDetailModal.style.display = 'flex';
        }
        
        // Refresh notifications to update read status
        loadNotifications();
      }
    });
  });
}

// Initialize notification modal handlers
document.addEventListener('DOMContentLoaded', () => {
  const notificationDetailModal = document.getElementById('notificationDetailModal');
  if (notificationDetailModal) {
    notificationDetailModal.style.display = 'none';
    
    const closeBtn = document.getElementById('closeNotificationDetail');
    if (closeBtn) {
      closeBtn.onclick = function() {
        notificationDetailModal.style.display = 'none';
      };
    }
    
    const deleteBtn = document.getElementById('deleteNotificationBtn');
    if (deleteBtn) {
      deleteBtn.onclick = async function() {
        const notificationId = this.dataset.notificationId;
        if (!notificationId) return;

        if (confirm('Are you sure you want to delete this notification?')) {
          try {
            const notificationRef = ref(db, `notifications/${notificationId}`);
            await set(notificationRef, null);
            notificationDetailModal.style.display = 'none';
            loadNotifications(); // Refresh notifications list
          } catch (error) {
            console.error('Error deleting notification:', error);
            alert('Error deleting notification. Please try again.');
          }
        }
      };
    }
  }
});