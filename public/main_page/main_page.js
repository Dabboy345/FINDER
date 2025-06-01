import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";
import { getDatabase, ref, get, set, push, onValue, update } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-database.js";

// Firebase config
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
const db = getDatabase(app);
const auth = getAuth(app);

// Global variables
const postsContainer = document.querySelector(".posts-container");
let currentUser = null;
let postsMap = {};

// Utility function to escape HTML to prevent XSS attacks
function escapeHtml(text) {
  if (!text) return "";
  return text.replace(/[&<>"']/g, m => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[m]);
}

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

// Initialize auth state listener
onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = '../index.html';
    return;
  }
  currentUser = user;
  listenForNotifications(user.uid);
  loadPosts();
});

// Load posts function
async function loadPosts() {
  const postsRef = ref(db, "posts");
  onValue(postsRef, async (snapshot) => {
    const data = snapshot.val();
    if (!data) {
      postsContainer.innerHTML = "<p>No posts found.</p>";
      return;
    }

    // Convert data to array and sort by timestamp
    const posts = Object.entries(data)
      .filter(([, post]) => post && typeof post === "object")
      .sort(([, a], [, b]) => (b.timestamp || 0) - (a.timestamp || 0));

    // Update postsMap
    postsMap = Object.fromEntries(posts);

    // Get user claims
    let userClaims = {};
    if (currentUser) {
      try {
        const claimsSnapshot = await get(ref(db, 'claims'));
        const claims = claimsSnapshot.val();
        if (claims) {
          userClaims = Object.values(claims).reduce((acc, claim) => {
            if (claim.from && claim.from.uid === currentUser.uid) {
              acc[claim.postId] = true;
            }
            return acc;
          }, {});
        }
      } catch (e) {
        console.error('Error loading claims:', e);
      }
    }

    // Render posts
    renderPosts(posts, userClaims);
  });
}

// Add this helper function for rendering posts
function renderPosts(posts, userClaims) {
  postsContainer.innerHTML = posts.map(([postId, post]) => `
    <div class="post ${post.claimed ? 'claimed' : ''} ${currentUser && post.user && currentUser.uid === post.user.uid ? 'own-post' : ''}" 
         data-post-id="${postId}">
      <div class="post-header">
        <h3>${escapeHtml(post.title)}</h3>
        ${currentUser && post.user && currentUser.uid === post.user.uid ? `
          <div class="post-actions">
            <button class="edit-btn" onclick="event.stopPropagation();handleEditPost('${postId}')">
              <i class="fas fa-edit"></i> Edit
            </button>
            <button class="delete-btn" onclick="event.stopPropagation();handleDeletePost('${postId}')">
              <i class="fas fa-trash"></i> Delete
            </button>
          </div>
        ` : ''}
      </div>
      <img src="${post.imageData || 'default-image.png'}" alt="${escapeHtml(post.title)}" onerror="this.onerror=null;this.src='default-image.png';" />
      ${post.description ? `<p>${escapeHtml(post.description)}</p>` : ''}
      ${post.labels?.length ? `
        <div class="labels">
          ${post.labels.map(label => `
            <span class="label">${escapeHtml(label)}</span>
          `).join('')}
        </div>
      ` : ''}
      <div class="post-meta">
        <div class="author">
          <i class="fas fa-user"></i>
          <span>${escapeHtml(post.user?.email || "Unknown")}</span>
          ${currentUser && post.user && currentUser.uid === post.user.uid ? `
            <span class="owner-badge">
              <i class="fas fa-crown"></i> Your Post
            </span>
          ` : ''}
        </div>
        <div class="timestamp">
          <i class="fas fa-clock"></i>
          <span>${post.timestamp ? new Date(post.timestamp).toLocaleString() : "Unknown"}</span>
          ${post.lastEdited ? `
            <div class="last-edited">
              <i class="fas fa-edit"></i>
              <span>Edited ${new Date(post.lastEdited).toLocaleString()}</span>
            </div>
          ` : ''}
        </div>
      </div>
      ${post.claimed ? `
        <div class="claim-status claimed">
          <i class="fas fa-check-circle"></i>
          <span>Claimed by ${escapeHtml(post.claimedBy?.email || "Unknown")}</span>
          ${(currentUser && (currentUser.uid === post.user.uid || currentUser.uid === post.claimedBy?.uid)) ? `
            <button class="chat-btn" onclick="event.stopPropagation();openChat('${postId}', '${currentUser.uid === post.user.uid ? post.claimedBy.uid : post.user.uid}', '${currentUser.uid === post.user.uid ? post.claimedBy.email : post.user.email}')">
              <i class="fas fa-comments"></i>
              Chat
            </button>
          ` : ''}
          ${(currentUser && post.claimedBy && currentUser.uid === post.claimedBy.uid) ? `
            <button class="unclaim-btn" onclick="event.stopPropagation();unclaimPost('${postId}')">
              <i class='fas fa-undo'></i> Unclaim
            </button>
          ` : ''}
        </div>
      ` : currentUser && post.user && currentUser.uid === post.user.uid ? `
        <div class="owner-message">
          <i class="fas fa-info-circle"></i>
          <span>This is your post - waiting for someone to claim it</span>
        </div>
      ` : userClaims[postId] ? `
        <div class="claim-status pending">
          <i class="fas fa-clock"></i>
          <span>You have already claimed this item</span>
          <button class="chat-btn" onclick="event.stopPropagation();openChat('${postId}', '${post.user.uid}', '${post.user.email}')">
            <i class="fas fa-comments"></i>
            Chat
          </button>
          <button class="unclaim-btn" onclick="event.stopPropagation();unclaimPost('${postId}')">
            <i class='fas fa-undo'></i> Unclaim
          </button>
        </div>
      ` : `
        <button class="claim-btn" onclick="event.stopPropagation();openClaimModal('${postId}')">
          <i class="fas fa-hand-holding"></i>
          Claim Item
        </button>
      `}
    </div>
  `).join("");

  // Add click handlers for posts
  addPostClickHandlers();
}

// Add click handlers for posts
function addPostClickHandlers() {
  document.querySelectorAll('.post[data-post-id]').forEach(postDiv => {
    postDiv.addEventListener('click', function(e) {
      // Ignore clicks on buttons
      if (e.target.closest('button')) return;
      
      const postId = this.getAttribute('data-post-id');
      window.location.href = `post-details.html?id=${encodeURIComponent(postId)}`;
    });
  });
}

// Function to handle claim
async function handleClaim(postId, post) {
  if (!currentUser) {
    alert("Please log in to claim an item.");
    return;
  }

  if (post.claimed) {
    alert("This item has already been claimed.");
    return;
  }

  if (post.user.uid === currentUser.uid) {
    alert("You cannot claim your own post.");
    return;
  }

  try {
    const postRef = ref(db, `posts/${postId}`);
    await update(postRef, {
      claimed: true,
      claimedBy: {
        uid: currentUser.uid,
        email: currentUser.email,
        timestamp: Date.now()
      }
    });
    alert("Item claimed successfully!");
  } catch (error) {
    console.error("Error claiming item:", error);
    alert("Error claiming item. Please try again.");
  }
}

// Function to handle unclaim
async function unclaimPost(postId) {
  if (!currentUser) {
    alert("Please log in to unclaim an item.");
    return;
  }

  const post = postsMap[postId];
  if (!post) {
    alert("Post not found.");
    return;
  }

  // Only the user who claimed the post can unclaim it
  if (!post.claimedBy || post.claimedBy.uid !== currentUser.uid) {
    alert("You can only unclaim posts you have claimed.");
    return;
  }

  // Show loading state
  const unclaimBtn = document.querySelector(`button[onclick*="unclaimPost('${postId}')"]`);
  if (unclaimBtn) {
    unclaimBtn.disabled = true;
    unclaimBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Unclaiming...';
  }

  try {
    const postRef = ref(db, `posts/${postId}`);
    await update(postRef, {
      claimed: false,
      claimedBy: null
    });

    // **FIX: Also remove any claim entries for this post and user**
    const claimsRef = ref(db, 'claims');
    const claimsSnapshot = await get(claimsRef);
    const claims = claimsSnapshot.val();
    
    if (claims) {
      const claimEntriesToRemove = Object.entries(claims).filter(([, claim]) => 
        claim.postId === postId && claim.from.uid === currentUser.uid
      );
      
      for (const [claimId] of claimEntriesToRemove) {
        await set(ref(db, `claims/${claimId}`), null);
      }
    }

    alert("You have unclaimed this item.");
    // Reload the page to reflect the changes immediately
    window.location.reload();
  } catch (error) {
    console.error("Error unclaiming item:", error);
    alert("Error unclaiming item. Please try again.");
    
    // Restore button state on error
    if (unclaimBtn) {
      unclaimBtn.disabled = false;
      unclaimBtn.innerHTML = '<i class="fas fa-undo"></i> Unclaim';
    }
  }
}

// Make unclaimPost function globally available
window.unclaimPost = unclaimPost;

// Modal logic
let currentClaimPostId = null;
let currentClaimPost = null;

// Function to check if user has already claimed a post
async function hasUserClaimedPost(postId, userId) {
  // Check if the post is marked as claimed by this user
  const postSnapshot = await get(ref(db, `posts/${postId}`));
  const post = postSnapshot.val();
  
  if (post && post.claimed && post.claimedBy && post.claimedBy.uid === userId) {
    return true;
  }

  // Also check the claims collection for any pending claims
  const claimsRef = ref(db, 'claims');
  const claimsSnapshot = await get(claimsRef);
  const claims = claimsSnapshot.val();
  
  if (!claims) return false;
  
  return Object.values(claims).some(claim => 
    claim.postId === postId && 
    claim.from.uid === userId
  );
}

// Update window.openClaimModal function
window.openClaimModal = async function(postId) {
  if (!currentUser) {
    alert("Please log in to claim an item.");
    return;
  }

  currentClaimPostId = postId;
  currentClaimPost = postsMap[postId];

  // **FIX: Check if the post is already claimed**
  if (currentClaimPost.claimed) {
    alert("This item has already been claimed by someone else.");
    return;
  }

  if (currentClaimPost.user && currentClaimPost.user.uid === currentUser.uid) {
    alert("You cannot claim your own post.");
    return;
  }

  // Check if user has already claimed this post
  const hasAlreadyClaimed = await hasUserClaimedPost(postId, currentUser.uid);
  if (hasAlreadyClaimed) {
    alert("You have already submitted a claim for this item.");
    return;
  }

  document.getElementById('finderEmail').textContent = currentClaimPost.user?.email || 'User';
  document.getElementById('claimMessage').value = '';
  document.getElementById('claimModal').style.display = 'flex';
};

document.getElementById('closeClaimModal').onclick =
document.getElementById('cancelClaimBtn').onclick = function() {
  document.getElementById('claimModal').style.display = 'none';
};

// Add notification handling
let unreadNotifications = 0;

// Function to create a notification
async function createNotification(toUserId, title, message, type, postId, additionalData = {}) {
  const notificationsRef = ref(db, 'notifications');
  
  // Check for existing notifications for this post
  const existingNotificationsSnapshot = await get(notificationsRef);
  const existingNotifications = existingNotificationsSnapshot.val() || {};
  
  // Find if there's an existing notification for this post
  const existingNotificationId = Object.entries(existingNotifications)
    .find(([, n]) => n.postId === postId && n.to === toUserId && !n.read)?.[0];

  const newClaim = {
    from: additionalData.from,
    message: additionalData.claimMessage,
    timestamp: Date.now()
  };

  if (existingNotificationId) {
    // Update existing notification
    const updatedNotification = {
      ...existingNotifications[existingNotificationId],
      lastUpdated: Date.now(),
      claimCount: (existingNotifications[existingNotificationId].claimCount || 1) + 1,
      claims: [
        ...(existingNotifications[existingNotificationId].claims || []),
        newClaim
      ]
    };
    await update(ref(db, `notifications/${existingNotificationId}`), updatedNotification);
  } else {
    // Create new notification
    const newNotification = {
      to: toUserId,
      title,
      message,
      type,
      postId,
      timestamp: Date.now(),
      lastUpdated: Date.now(),
      read: false,
      claimCount: 1,
      claims: [newClaim]
    };
    await push(notificationsRef, newNotification);
  }
}

// Function to update notification badge
function updateNotificationBadge(count) {
  const badge = document.getElementById('notificationBadge');
  if (count > 0) {
    badge.style.display = 'block';
    badge.textContent = count;
  } else {
    badge.style.display = 'none';
  }
}

// Listen for notifications
function listenForNotifications(userId) {
  const notificationsRef = ref(db, 'notifications');
  onValue(notificationsRef, (snapshot) => {
    const data = snapshot.val();
    if (!data) return;

    unreadNotifications = Object.values(data)
      .filter(n => n.to === userId && !n.read)
      .length;
    
    updateNotificationBadge(unreadNotifications);
  });
}

// Update the sendClaimBtn click handler
document.getElementById('sendClaimBtn').onclick = async function() {
  const message = document.getElementById('claimMessage').value.trim();
  if (!message) {
    alert('Please enter a message.');
    return;
  }
  if (!currentUser) {
    alert('You must be logged in to send a claim.');
    return;
  }

  // **FIX: Double-check if the post is still available before claiming**
  const currentPostSnapshot = await get(ref(db, `posts/${currentClaimPostId}`));
  const currentPostData = currentPostSnapshot.val();
  
  if (!currentPostData) {
    alert('This post no longer exists.');
    document.getElementById('claimModal').style.display = 'none';
    return;
  }
  
  if (currentPostData.claimed) {
    alert('This item has already been claimed by someone else.');
    document.getElementById('claimModal').style.display = 'none';
    return;
  }

  try {
    // Store the message in Firebase
    const claimsRef = ref(db, 'claims');
    const newClaim = {
      postId: currentClaimPostId,
      postTitle: currentClaimPost.title,
      to: currentClaimPost.user,
      from: { uid: currentUser.uid, email: currentUser.email },
      message,
      timestamp: Date.now()
    };
    await push(claimsRef, newClaim);

    // **FIX: Automatically mark the post as claimed when claim request is sent**
    const postRef = ref(db, `posts/${currentClaimPostId}`);
    await update(postRef, {
      claimed: true,
      claimedBy: {
        uid: currentUser.uid,
        email: currentUser.email,
        timestamp: Date.now()
      }
    });

    // Create notification for the post creator with additional data
    await createNotification(
      currentClaimPost.user.uid,
      'New Claim Request',
      `${currentUser.email} wants to claim your item: ${currentClaimPost.title}`,
      'claim',
      currentClaimPostId,
      {
        from: { uid: currentUser.uid, email: currentUser.email },
        claimMessage: message
      }
    );

    document.getElementById('claimModal').style.display = 'none';
    alert('Claim request sent successfully!');
    window.location.reload();
  } catch (error) {
    console.error('Error sending message:', error);
    alert('Error sending message. Please try again.');
  }
};

// Delete this entire block
// Add notification dropdown
const notificationContainer = document.querySelector('.notification-container');
const notificationDropdown = document.createElement('div');
notificationDropdown.className = 'notification-dropdown';
notificationContainer.appendChild(notificationDropdown);

// Toggle notification dropdown
notificationContainer.addEventListener('click', () => {
  notificationDropdown.classList.toggle('show');
  if (notificationDropdown.classList.contains('show')) {
    loadNotifications();
  }
});

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
  if (!notificationContainer.contains(e.target)) {
    notificationDropdown.classList.remove('show');
  }
});

// Load notifications
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
    .sort(([, a], [, b]) => b.lastUpdated - a.lastUpdated);

  notificationDropdown.innerHTML = notifications.map(([id, notification]) => {
    const timeString = formatDate(notification.lastUpdated);
    const claimCount = notification.claimCount || 1;
    
    return `
      <div class="notification-item ${notification.read ? '' : 'unread'}" data-id="${id}">
        <div class="notification-title">
          <i class="fas ${notification.type === 'claim' ? 'fa-hand-holding' : 'fa-tag'}"></i>
          ${escapeHtml(notification.title)}
        </div>
        <div class="notification-message">
          ${claimCount > 1 ?
            `${claimCount} people want to claim your item` :
            escapeHtml(notification.message)
          }
        </div>
        <div class="notification-time">${timeString}</div>
      </div>
    `;
  }).join('');

  setupNotificationClickHandler();
}

// Initialize notifications when user is logged in
onAuthStateChanged(auth, (user) => {
  currentUser = user;
  if (user) {
    listenForNotifications(user.uid);
  }
});

// Remove any code that creates/appends the notificationDetailModal in JS if it is already in the HTML
// Only select and control the modal if it exists in the DOM
const notificationDetailModal = document.getElementById('notificationDetailModal');
if (notificationDetailModal) {
  notificationDetailModal.style.display = 'none';
  document.addEventListener('DOMContentLoaded', () => {
    notificationDetailModal.style.display = 'none';
  });
  const closeBtn = document.getElementById('closeNotificationDetail');
  if (closeBtn) {
    closeBtn.onclick = function() {
      notificationDetailModal.style.display = 'none';
    };
  }
}

// Add delete notification functionality
// Add a null check for deleteNotificationBtn to prevent errors if the element does not exist
const deleteNotificationBtn = document.getElementById('deleteNotificationBtn');
if (deleteNotificationBtn) {
  deleteNotificationBtn.onclick = async function() {
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

// Update notification detail modal to the DOM
document.addEventListener('DOMContentLoaded', () => {
  const notificationDetailModal = document.getElementById('notificationDetailModal');
  if (notificationDetailModal) {
    notificationDetailModal.style.display = 'none';
  }
});

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
        if (notificationDetailModal) {
          notificationDetailModal.style.display = 'flex';
        }
        
        // Refresh notifications to update read status
        loadNotifications();
      }
    });
  });
}




























