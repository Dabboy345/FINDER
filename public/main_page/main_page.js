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
    // The onValue listener should automatically update the UI
    // No need to reload the page
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

// Update notification click handler to show details
async function showNotificationDetail(notification) {
  // Set the notification ID for the delete button
  document.getElementById('deleteNotificationBtn').dataset.notificationId = notification.id;

  let html = `
    <div class="notification-header">
      <div class="notification-title">
        <i class="fas ${notification.type === 'claim' ? 'fa-hand-holding' : 'fa-tag'}"></i>
        ${escapeHtml(notification.title)}
      </div>
      <div class="notification-time">
        Created: ${formatDate(notification.timestamp)}<br>
        Last updated: ${formatDate(notification.lastUpdated)}
      </div>
    </div>
  `;

  if (notification.claims && notification.claims.length > 0) {
    html += `
      <div class="claims-list">
        <h3>Claim Messages (${notification.claims.length})</h3>
        ${notification.claims.map(claim => `
          <div class="claim-item">
            <div class="claim-header">
              <strong>${escapeHtml(claim.from.email)}</strong>
              <span>${formatDate(claim.timestamp)}</span>
            </div>
            <div class="claim-message">${formatMessage(claim.message)}</div>
          </div>
        `).join('')}
      </div>
    `;
  }

  if (notification.postId) {
    const post = await getPostById(notification.postId);
    let matchedWithPost = null;
    if (notification.matchedWithId) {
      matchedWithPost = await getPostById(notification.matchedWithId);
    }
    if (post && matchedWithPost) {
      html += `
        <div class="post-details" style="display:flex;gap:1.5rem;flex-wrap:wrap;justify-content:center;">
          <div style="flex:1;min-width:180px;max-width:260px;">
            <h3>Your Post</h3>
            <div class="post-title">${escapeHtml(matchedWithPost.title)}</div>
            ${matchedWithPost.imageData ? 
              `<img src="${matchedWithPost.imageData}" alt="${escapeHtml(matchedWithPost.title)}" 
                    style="max-width:100%;margin:10px 0;" 
                    onerror="this.onerror=null;this.src='default-image.png';" />` : 
              ''
            }
            ${matchedWithPost.description ? 
              `<div class="post-description">${formatMessage(matchedWithPost.description)}</div>` : 
              ''
            }
            ${matchedWithPost.labels && matchedWithPost.labels.length ? 
              `<div class="post-labels">
                ${matchedWithPost.labels.map(l => `<span class="label">${escapeHtml(l)}</span>`).join('')}
              </div>` : 
              ''
            }
          </div>
          <div style="flex:1;min-width:180px;max-width:260px;">
            <h3>Matched Post</h3>
            <div class="post-title">${escapeHtml(post.title)}</div>
            ${post.imageData ? 
              `<img src="${post.imageData}" alt="${escapeHtml(post.title)}" 
                    style="max-width:100%;margin:10px 0;" 
                    onerror="this.onerror=null;this.src='default-image.png';" />` : 
              ''
            }
            ${post.description ? 
              `<div class="post-description">${formatMessage(post.description)}</div>` : 
              ''
            }
            ${post.labels && post.labels.length ? 
              `<div class="post-labels">
                ${post.labels.map(l => `<span class="label">${escapeHtml(l)}</span>`).join('')}
              </div>` : 
              ''
            }
          </div>
        </div>
      `;
    } else if (post) {
      // fallback: show only matched post
      html += `
        <div class="post-details">
          <h3>Post Details</h3>
          <div class="post-title">${escapeHtml(post.title)}</div>
          ${post.imageData ? 
            `<img src="${post.imageData}" alt="${escapeHtml(post.title)}" 
                  style="max-width:100%;margin:10px 0;" 
                  onerror="this.onerror=null;this.src='default-image.png';" />` : 
            ''
          }
          ${post.description ? 
            `<div class="post-description">${formatMessage(post.description)}</div>` : 
            ''
          }
          ${post.labels && post.labels.length ? 
            `<div class="post-labels">
              ${post.labels.map(l => `<span class="label">${escapeHtml(l)}</span>`).join(' ')}
            </div>` : 
            ''
          }
        </div>
      `;
    }
  }

  document.getElementById('notificationDetailBody').innerHTML = html;
}

// Helper function to format dates consistently
function formatDate(timestamp) {
  if (!timestamp) return 'Unknown date';
  const date = new Date(timestamp);
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
}

// Helper function to format messages with line breaks
function formatMessage(message) {
  if (!message) return '';
  return escapeHtml(message).replace(/\n/g, '<br>');
}

// Helper function to fetch post details by postId
async function getPostById(postId) {
  const postRef = ref(db, `posts/${postId}`);
  const snapshot = await get(postRef);
  return snapshot.exists() ? snapshot.val() : null;
}

// Add edit and delete post handlers
window.handleEditPost = async function(postId) {
  const post = postsMap[postId];
  if (!currentUser || !post.user || post.user.uid !== currentUser.uid) {
    alert("You can only edit your own posts.");
    return;
  }

  // Create and show edit modal
  const editModal = document.createElement('div');
  editModal.className = 'modal';
  editModal.innerHTML = `
    <div class="modal-content">
      <span class="close">&times;</span>
      <h2>Edit Post</h2>
      <form id="editPostForm">
        <label for="editTitle">Title</label>
        <input type="text" id="editTitle" value="${escapeHtml(post.title)}" required>
        
        <label for="editDescription">Description</label>
        <textarea id="editDescription">${escapeHtml(post.description || '')}</textarea>
        
        <label for="editLabels">Labels (comma separated)</label>
        <input type="text" id="editLabels" value="${post.labels ? post.labels.join(', ') : ''}">
        
        <label for="editImage">Image</label>
        <input type="file" id="editImage" accept="image/*">
        <div id="currentImagePreview">
          ${post.imageData ? `<img src="${post.imageData}" alt="Current Image" style="max-width:100px;max-height:100px;" />` : ''}
        </div>
        <div class="modal-buttons">
          <button type="button" id="cancelEditBtn">Cancel</button>
          <button type="submit">Save Changes</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(editModal);

  // Add event listeners
  const closeBtn = editModal.querySelector('.close');
  const cancelBtn = editModal.querySelector('#cancelEditBtn');
  const form = editModal.querySelector('#editPostForm');
  const imageInput = form.querySelector('#editImage');

  const closeModal = () => {
    editModal.remove();
  };

  closeBtn.onclick = closeModal;
  cancelBtn.onclick = closeModal;

  form.onsubmit = async (e) => {
    e.preventDefault();
    let imageUrl = post.imageData;
    const file = imageInput.files[0];
    if (file) {
      try {
        imageUrl = await uploadImageToImgbb(file);
      } catch (err) {
        alert('Image upload failed. Please try again.');
        return;
      }
    }
    const updatedPost = {
      ...post,
      title: form.editTitle.value.trim(),
      description: form.editDescription.value.trim(),
      labels: form.editLabels.value.split(',').map(label => label.trim()).filter(Boolean),
      imageData: imageUrl,
      lastEdited: Date.now()
    };

    try {
      const postRef = ref(db, `posts/${postId}`);
      await update(postRef, updatedPost);
      closeModal();
    } catch (error) {
      console.error('Error updating post:', error);
    }
  };
};

window.handleDeletePost = async function(postId) {
  const post = postsMap[postId];
  if (!currentUser || post.user.uid !== currentUser.uid) {
    alert("You can only delete your own posts.");
    return;
  }

  if (!confirm("Are you sure you want to delete this post? This action cannot be undone.")) {
    return;
  }

  try {
    // Delete the post from the database
    const postRef = ref(db, `posts/${postId}`);
    await set(postRef, null);
  } catch (error) {
    console.error('Error deleting post:', error);
  }
};

// Handle navigation and authentication
document.getElementById('homeBtn').addEventListener('click', (e) => {
  e.preventDefault();
  if (currentUser) {
    // Already on home page, do nothing or refresh
    window.location.reload();
  } else {
    window.location.href = '../index.html';
  }
});

// Handle logo click - redirect to main page
const logoElement = document.querySelector('.logo');
if (logoElement) {
  logoElement.addEventListener('click', () => {
    window.location.href = './main_page.html';
  });
}

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

// Check authentication state and redirect if not logged in
onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = '../index.html';
  } else {
    currentUser = user;
  }
});

// Chat functionality
let currentChatId = null;
let currentChatPartner = null;
let currentChatPost = null;

// Function to generate a unique chat ID
function generateChatId(user1Id, user2Id, postId) {
  const sortedIds = [user1Id, user2Id].sort();
  return `${sortedIds[0]}_${sortedIds[1]}_${postId}`;
}

// Function to open chat
async function openChat(postId, otherUserId, otherUserEmail) {
  if (!currentUser) {
    alert("Please log in to use the chat.");
    return;
  }

  const post = postsMap[postId];
  if (!post) return;

  currentChatId = generateChatId(currentUser.uid, otherUserId, postId);
  currentChatPartner = { uid: otherUserId, email: otherUserEmail };
  // Ensure currentChatPost has an id property
  currentChatPost = { ...post, id: postId };

  // Update chat modal info
  document.getElementById('chatWithUser').textContent = otherUserEmail;
  document.getElementById('chatItemTitle').textContent = post.title;
  document.getElementById('chatMessageInput').value = '';
  
  // Show chat modal
  document.getElementById('chatModal').style.display = 'flex';
  
  // Load and listen to messages
  await loadMessages();
  listenToNewMessages();
}

// Function to load messages
async function loadMessages() {
  if (!currentChatId) return;

  const messagesRef = ref(db, `chats/${currentChatId}/messages`);
  const snapshot = await get(messagesRef);
  const messages = snapshot.val() || {};
  
  displayMessages(Object.entries(messages));
}

// Function to listen to new messages
function listenToNewMessages() {
  if (!currentChatId) return;

  const messagesRef = ref(db, `chats/${currentChatId}/messages`);
  onValue(messagesRef, (snapshot) => {
    const messages = snapshot.val() || {};
    displayMessages(Object.entries(messages));
  });
}

// Function to display messages
function displayMessages(messages) {
  const chatMessages = document.getElementById('chatMessages');
  
  chatMessages.innerHTML = messages
    .sort(([, a], [, b]) => a.timestamp - b.timestamp)
    .map(([, message]) => `
      <div class="message ${message.senderId === currentUser.uid ? 'sent' : 'received'}">
        <div class="message-content">${formatMessage(message.text)}</div>
        <div class="timestamp">${formatDate(message.timestamp)}</div>
      </div>
    `).join('');
  
  // Scroll to bottom
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Function to send message
async function sendMessage(text) {
  if (!currentChatId || !text.trim()) return;

  const messagesRef = ref(db, `chats/${currentChatId}/messages`);
  const newMessage = {
    text: text.trim(),
    senderId: currentUser.uid,
    senderEmail: currentUser.email,
    timestamp: Date.now()
  };

  await push(messagesRef, newMessage);

  // Defensive: Only send notification if postId is defined
  if (currentChatPost && currentChatPost.id) {
    await createNotification(
      currentChatPartner.uid,
      'New Message',
      `${currentUser.email} sent you a message about: ${currentChatPost.title}`,
      'chat',
      currentChatPost.id,
      {
        chatId: currentChatId,
        message: text.trim()
      }
    );
  }
  
  // Reload the page after sending message
  window.location.reload();
}

// Chat modal event listeners
document.getElementById('closeChatModal').onclick = function() {
  document.getElementById('chatModal').style.display = 'none';
  currentChatId = null;
  currentChatPartner = null;
  currentChatPost = null;
};

// Update the chat input handlers
document.getElementById('sendChatMessage').addEventListener('click', async (e) => {
  e.preventDefault();
  const input = document.getElementById('chatMessageInput');
  const text = input.value.trim();
  if (text) {
    await sendMessage(text);
    input.value = ''; // Clear the input after sending
    input.focus();    // Keep focus for continuous chatting
  }
});

document.getElementById('chatMessageInput').addEventListener('keydown', async (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    const input = e.target;
    const text = input.value.trim();
    if (text) {
      await sendMessage(text);
      input.value = ''; // Clear the input after sending
      input.focus();    // Keep focus for continuous chatting
    }
  }
});

// Make chat function available globally
window.openChat = openChat;

// Enhanced Find Matches function
document.getElementById('findMatchesBtn').addEventListener('click', async () => {
  if (!currentUser) {
    alert("Please log in to use the matching feature.");
    return;
  }

  const postsSnapshot = await get(ref(db, 'posts'));
  const postsData = postsSnapshot.val();
  if (!postsData) {
    alert("No posts available for matching.");
    return;
  }

  // Get user's posts
  const myPosts = Object.entries(postsData)
    .filter(([, post]) => post.user?.uid === currentUser.uid)
    .map(([id, post]) => ({ id, ...post }));

  if (myPosts.length === 0) {
    alert("You need to create a post first to find matches.");
    return;
  }

  // Find all potential matches for user's posts
  const allMatches = findAllMatches(myPosts, postsData);
  
  if (allMatches.length === 0) {
    showNoMatchesModal();
  } else {
    showMatchesModal(allMatches);
  }
});

// Find all matches for user's posts
function findAllMatches(userPosts, allPosts) {
  const otherPosts = Object.entries(allPosts)
    .filter(([, post]) => post.user?.uid !== currentUser.uid)
    .map(([id, post]) => ({ id, ...post }));

  let allMatches = [];

  for (const myPost of userPosts) {
    const myType = myPost.type?.toLowerCase();
    if (myType !== "lost" && myType !== "found") continue;

    for (const otherPost of otherPosts) {
      const otherType = otherPost.type?.toLowerCase();
      if (!otherType || myType === otherType) continue;

      // Calculate comprehensive similarity
      const similarity = calculateEnhancedSimilarity(myPost, otherPost);
      
      // Consider it a match if confidence is above 10% (inclusive threshold)
      if (similarity.confidence >= 10) {
        allMatches.push({
          myPost,
          otherPost,
          similarity,
          matchId: `${myPost.id}-${otherPost.id}`
        });
      }
    }
  }

  // Sort by confidence (highest first)
  return allMatches.sort((a, b) => b.similarity.confidence - a.similarity.confidence);
}

// Show modal with no matches found
function showNoMatchesModal() {
  const modal = document.createElement('div');
  modal.className = 'matches-modal';
  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h2>🔍 Find Matches Results</h2>
        <button class="close-btn">×</button>
      </div>
      
      <div class="no-matches-content">
        <div class="no-matches-icon">😔</div>
        <h3>No matches found at this time</h3>
        <p>We couldn't find any potential matches for your posts right now. Here are some tips:</p>
        
        <div class="tips">
          <div class="tip">
            <strong>📝 Add more details:</strong> Include specific descriptions, colors, brands, or locations
          </div>
          <div class="tip">
            <strong>🏷️ Use multiple labels:</strong> Add relevant tags in different languages (Spanish, Catalan, English)
          </div>
          <div class="tip">
            <strong>🔄 Check back later:</strong> New posts are added regularly by other users
          </div>
          <div class="tip">
            <strong>📍 Include location:</strong> Specify where you lost or found the item
          </div>
        </div>
        
        <div class="modal-actions">
          <button class="primary-btn" id="closeNoMatchBtn">Got it</button>
          <button class="secondary-btn" id="createNewPostBtn">Create New Post</button>
        </div>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Add event listeners for buttons
  const closeBtn = modal.querySelector('.close-btn');
  const closeNoMatchBtn = modal.querySelector('#closeNoMatchBtn');
  const createNewPostBtn = modal.querySelector('#createNewPostBtn');
  
  closeBtn.addEventListener('click', closeMatchesModal);
  closeNoMatchBtn.addEventListener('click', closeMatchesModal);
  createNewPostBtn.addEventListener('click', () => {
    closeMatchesModal();
    window.location.href = 'post-creation.html';
  });
  
  // Add event listener for clicking outside the modal
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeMatchesModal();
    }
  });
}

// Show modal with all matches
function showMatchesModal(matches) {
  const modal = document.createElement('div');
  modal.className = 'matches-modal';
  
  // Categorize matches by confidence
  const highConfidence = matches.filter(m => m.similarity.confidence >= 70);
  const mediumConfidence = matches.filter(m => m.similarity.confidence >= 40 && m.similarity.confidence < 70);
  const lowConfidence = matches.filter(m => m.similarity.confidence >= 10 && m.similarity.confidence < 40);
  
  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h2>🎯 Found ${matches.length} Potential Match${matches.length > 1 ? 'es' : ''}</h2>
        <button class="close-btn">×</button>
      </div>
      
      <div class="matches-content">
        <div class="matches-summary">
          <div class="summary-stats">
            <div class="stat high">${highConfidence.length} High confidence</div>
            <div class="stat medium">${mediumConfidence.length} Good matches</div>
            <div class="stat low">${lowConfidence.length} Potential matches</div>
          </div>
        </div>
        
        <div class="matches-list">
          ${renderMatchCategory('🔥 High Confidence Matches', highConfidence, 'high')}
          ${renderMatchCategory('✨ Good Matches', mediumConfidence, 'medium')}
          ${renderMatchCategory('💡 Potential Matches', lowConfidence, 'low')}
        </div>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Add event listener for close button (fix for close button not working)
  const closeBtn = modal.querySelector('.close-btn');
  closeBtn.addEventListener('click', closeMatchesModal);
  
  // Add event listener for clicking outside the modal
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeMatchesModal();
    }
  });
  
  // Add event listeners for match cards (enhanced match details)
  const matchCards = modal.querySelectorAll('.match-card');
  matchCards.forEach(card => {
    card.addEventListener('click', () => {
      const matchData = JSON.parse(card.getAttribute('data-match').replace(/&apos;/g, "'"));
      showDetailedMatchPreview(matchData);
    });
  });
  
  // Add modal styles
  addMatchesModalStyles();
}

// Render a category of matches
function renderMatchCategory(title, matches, category) {
  if (matches.length === 0) return '';
  
  return `
    <div class="match-category ${category}">
      <h3>${title}</h3>
      <div class="matches-grid">
        ${matches.map(match => renderMatchCard(match)).join('')}
      </div>
    </div>
  `;
}

// Render a single match card
function renderMatchCard(match) {
  const { myPost, otherPost, similarity } = match;
  
  return `
    <div class="match-card" data-match='${JSON.stringify(match).replace(/'/g, "&apos;")}'>
      <div class="match-score ${getConfidenceClass(similarity.confidence)}">
        ${similarity.confidence}%
      </div>
      
      <div class="match-comparison">
        <div class="post-info my-post">
          <span class="post-type ${myPost.type}">${myPost.type}</span>
          <h4>${myPost.title}</h4>
          <p>${truncateText(myPost.description || 'No description', 50)}</p>
        </div>
        
        <div class="match-arrow">↔</div>
        
        <div class="post-info other-post">
          <span class="post-type ${otherPost.type}">${otherPost.type}</span>
          <h4>${otherPost.title}</h4>
          <p>${truncateText(otherPost.description || 'No description', 50)}</p>
        </div>
      </div>
      
      <div class="match-factors">
        <div class="factors-title">Matching factors:</div>
        <div class="factors-list">
          ${similarity.matchingFactors.slice(0, 2).map(factor => `<span class="factor">${factor}</span>`).join('')}
          ${similarity.matchingFactors.length > 2 ? `<span class="factor-more">+${similarity.matchingFactors.length - 2} more</span>` : ''}
        </div>
      </div>
    </div>
  `;
}

// Helper functions
function getConfidenceClass(confidence) {
  if (confidence >= 70) return 'high';
  if (confidence >= 40) return 'medium';
  return 'low';
}

function truncateText(text, maxLength) {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

function closeMatchesModal() {
  const modal = document.querySelector('.matches-modal');
  if (modal) {
    modal.remove();
  }
}

// Enhanced detailed match preview function
function showDetailedMatchPreview(matchData) {
  const { myPost, otherPost, similarity } = matchData;
  
  // Remove any existing preview modal
  const existingPreview = document.querySelector('.match-preview-modal');
  if (existingPreview) {
    existingPreview.remove();
  }
  
  const previewModal = document.createElement('div');
  previewModal.className = 'match-preview-modal';
  
  // Format timestamps
  const formatDate = (timestamp) => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };
  
  previewModal.innerHTML = `
    <div class="preview-content">
      <div class="preview-header">
        <h2>🔍 Match Details Preview</h2>
        <button class="preview-close-btn">×</button>
      </div>
      
      <div class="match-confidence-display">
        <div class="confidence-meter ${getConfidenceClass(similarity.confidence)}">
          <div class="confidence-bar" style="width: ${similarity.confidence}%"></div>
          <span class="confidence-text">${similarity.confidence}% Match Confidence</span>
        </div>
      </div>
      
      <div class="detailed-comparison">
        <div class="post-detail my-post-detail">
          <div class="detail-header">
            <span class="post-type-badge ${myPost.type}">YOUR ${myPost.type.toUpperCase()}</span>
            <span class="post-date">${formatDate(myPost.timestamp)}</span>
          </div>
          <h3>${escapeHtml(myPost.title)}</h3>
          ${myPost.imageData ? `
            <div class="post-image-container">
              <img src="${myPost.imageData}" alt="${escapeHtml(myPost.title)}" class="post-preview-image" />
            </div>
          ` : `
            <div class="no-image-placeholder">
              <i class="fas fa-image"></i>
              <span>No image available</span>
            </div>
          `}
          <div class="post-description">
            <strong>Description:</strong>
            <p>${escapeHtml(myPost.description || 'No description provided')}</p>
          </div>
          ${myPost.location ? `
            <div class="post-location">
              <i class="fas fa-map-marker-alt"></i>
              <span>${escapeHtml(myPost.location)}</span>
            </div>
          ` : ''}
          ${myPost.labels && myPost.labels.length > 0 ? `
            <div class="post-labels">
              <strong>Labels:</strong>
              <div class="labels-list">
                ${myPost.labels.map(label => `<span class="label-tag">${escapeHtml(label)}</span>`).join('')}
              </div>
            </div>
          ` : ''}
        </div>
        
        <div class="match-divider">
          <div class="match-connection-line"></div>
          <div class="match-icon">🔗</div>
        </div>
        
        <div class="post-detail other-post-detail">
          <div class="detail-header">
            <span class="post-type-badge ${otherPost.type}">POTENTIAL ${otherPost.type.toUpperCase()}</span>
            <span class="post-date">${formatDate(otherPost.timestamp)}</span>
          </div>
          <h3>${escapeHtml(otherPost.title)}</h3>
          ${otherPost.imageData ? `
            <div class="post-image-container">
              <img src="${otherPost.imageData}" alt="${escapeHtml(otherPost.title)}" class="post-preview-image" />
            </div>
          ` : `
            <div class="no-image-placeholder">
              <div class="no-image-icon">
                <i class="fas fa-image"></i>
                <span>No image available</span>
              </div>
            </div>
          `}
          <div class="post-description">
            <strong>Description:</strong>
            <p>${escapeHtml(otherPost.description || 'No description provided')}</p>
          </div>
          ${otherPost.location ? `
            <div class="post-location">
              <i class="fas fa-map-marker-alt"></i>
              <span>${escapeHtml(otherPost.location)}</span>
            </div>
          ` : ''}
          ${otherPost.labels && otherPost.labels.length > 0 ? `
            <div class="post-labels">
              <strong>Labels:</strong>
              <div class="labels-list">
                ${otherPost.labels.map(label => `<span class="label-tag">${escapeHtml(label)}</span>`).join('')}
              </div>
            </div>
          ` : ''}
        </div>
      </div>
      
      <div class="matching-analysis">
        <h4>🎯 Why This Matches:</h4>
        <div class="factors-grid">
          ${similarity.matchingFactors.map(factor => `
            <div class="factor-item">
              <i class="fas fa-check-circle"></i>
              <span>${escapeHtml(factor)}</span>
            </div>
          `).join('')}
        </div>
      </div>
      
      <div class="preview-actions">
        <button class="action-btn secondary" id="backToMatches">
          <i class="fas fa-arrow-left"></i>
          Back to Matches
        </button>
        <button class="action-btn primary" id="viewFullDetails">
          <i class="fas fa-eye"></i>
          View Full Details & Contact
        </button>
      </div>
    </div>
  `;
  
  document.body.appendChild(previewModal);
  
  // Add event listeners
  const closeBtn = previewModal.querySelector('.preview-close-btn');
  const backBtn = previewModal.querySelector('#backToMatches');
  const viewDetailsBtn = previewModal.querySelector('#viewFullDetails');
  
  closeBtn.addEventListener('click', () => previewModal.remove());
  backBtn.addEventListener('click', () => previewModal.remove());
  viewDetailsBtn.addEventListener('click', () => {
    previewModal.remove();
    closeMatchesModal();
    window.location.href = `post-details.html?id=${encodeURIComponent(otherPost.id)}&matchedWith=${encodeURIComponent(myPost.id)}`;
  });
  
  // Close on outside click
  previewModal.addEventListener('click', (e) => {
    if (e.target === previewModal) {
      previewModal.remove();
    }
  });
  
  // Add preview modal styles
  addMatchPreviewStyles();
}

// Add comprehensive modal styles
function addMatchesModalStyles() {
  if (document.querySelector('#matches-modal-styles')) return;
  
  const style = document.createElement('style');
  style.id = 'matches-modal-styles';
  style.textContent = `
    .matches-modal {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.8);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 10000;
      animation: fadeIn 0.3s ease-out;
    }
    
    .matches-modal .modal-content {
      background: white;
      border-radius: 12px;
      width: 95%;
      max-width: 1000px;
      max-height: 90vh;
      overflow: hidden;
      box-shadow: 0 25px 50px rgba(0, 0, 0, 0.3);
      animation: slideUp 0.3s ease-out;
      display: flex;
      flex-direction: column;
    }
    
    .matches-modal .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 24px;
      border-bottom: 2px solid #f8f9fa;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
    }
    
    .matches-modal .modal-header h2 {
      margin: 0;
      font-size: 1.5em;
    }
    
    .matches-modal .close-btn {
      background: rgba(255, 255, 255, 0.2);
      border: none;
      color: white;
      font-size: 24px;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s;
    }
    
    .matches-modal .close-btn:hover {
      background: rgba(255, 255, 255, 0.3);
    }
    
    .matches-content {
      padding: 24px;
      overflow-y: auto;
      flex: 1;
    }
    
    .matches-summary {
      margin-bottom: 24px;
    }
    
    .summary-stats {
      display: flex;
      gap: 16px;
      justify-content: center;
      flex-wrap: wrap;
    }
    
    .stat {
      padding: 12px 20px;
      border-radius: 25px;
      font-weight: 600;
      color: white;
      text-align: center;
      min-width: 120px;
    }
    
    .stat.high {
      background: linear-gradient(135deg, #27ae60, #2ecc71);
    }
    
    .stat.medium {
      background: linear-gradient(135deg, #f39c12, #e67e22);
    }
    
    .stat.low {
      background: linear-gradient(135deg, #3498db, #2980b9);
    }
    
    .match-category {
      margin-bottom: 32px;
    }
    
    .match-category h3 {
      color: #2c3e50;
      margin-bottom: 16px;
      font-size: 1.2em;
      padding-bottom: 8px;
      border-bottom: 2px solid #ecf0f1;
    }
    
    .matches-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
      gap: 16px;
    }
    
    .match-card {
      border: 2px solid #ecf0f1;
      border-radius: 12px;
      padding: 20px;
      cursor: pointer;
      transition: all 0.3s ease;
      background: white;
      position: relative;
      overflow: hidden;
    }
    
    .match-card:hover {
      transform: translateY(-3px);
      box-shadow: 0 8px 25px rgba(0, 0, 0, 0.15);
      border-color: #3498db;
    }
    
    .match-card::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 4px;
      background: linear-gradient(90deg, #3498db, #2980b9);
      transform: scaleX(0);
      transition: transform 0.3s ease;
    }
    
    .match-card:hover::before {
      transform: scaleX(1);
    }
    
    .match-score {
      position: absolute;
      top: 16px;
      right: 16px;
      padding: 8px 12px;
      border-radius: 20px;
      font-weight: bold;
      font-size: 0.9em;
      color: white;
    }
    
    .match-score.high {
      background: #27ae60;
    }
    
    .match-score.medium {
      background: #f39c12;
    }
    
    .match-score.low {
      background: #3498db;
    }
    
    .match-comparison {
      display: flex;
      align-items: center;
      gap: 16px;
      margin-bottom: 16px;
      margin-top: 8px;
    }
    
    .post-info {
      flex: 1;
      min-width: 0;
    }
    
    .post-info h4 {
      margin: 8px 0 4px 0;
      color: #2c3e50;
      font-size: 1em;
      line-height: 1.3;
    }
    
    .post-info p {
      margin: 0;
      color: #7f8c8d;
      font-size: 0.85em;
      line-height: 1.4;
    }
    
    .post-type {
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 0.75em;
      font-weight: bold;
      text-transform: uppercase;
    }
    
    .post-type.lost {
      background: #e74c3c;
      color: white;
    }
    
    .post-type.found {
      background: #27ae60;
      color: white;
    }
    
    .match-arrow {
      font-size: 1.2em;
      color: #3498db;
      font-weight: bold;
      flex-shrink: 0;
    }
    
    .match-factors {
      border-top: 1px solid #ecf0f1;
      padding-top: 12px;
    }
    
    .factors-title {
      font-size: 0.8em;
      color: #7f8c8d;
      margin-bottom: 6px;
      font-weight: 500;
    }
    
    .factors-list {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    
    .factor {
      background: #f8f9fa;
      color: #5a6c7d;
      padding: 4px 8px;
      border-radius: 12px;
      font-size: 0.75em;
      border: 1px solid #e9ecef;
    }
    
    .factor-more {
      background: #3498db;
      color: white;
      padding: 4px 8px;
      border-radius: 12px;
      font-size: 0.75em;
      font-weight: 500;
    }
    
    .no-matches-content {
      text-align: center;
      padding: 40px 20px;
    }
    
    .no-matches-icon {
      font-size: 4em;
      margin-bottom: 20px;
    }
    
    .no-matches-content h3 {
      color: #2c3e50;
      margin-bottom: 16px;
    }
    
    .no-matches-content p {
      color: #7f8c8d;
      margin-bottom: 32px;
      line-height: 1.6;
    }
    
    .tips {
      text-align: left;
      max-width: 500px;
      margin: 0 auto 32px;
    }
    
    .tip {
      background: #f8f9fa;
      padding: 16px;
      border-radius: 8px;
      margin-bottom: 12px;
      border-left: 4px solid #3498db;
    }
    
    .modal-actions {
      display: flex;
      gap: 12px;
      justify-content: center;
      flex-wrap: wrap;
    }
    
    .primary-btn, .secondary-btn {
      padding: 12px 24px;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-weight: 500;
      transition: all 0.2s;
    }
    
    .primary-btn {
      background: #3498db;
      color: white;
    }
    
    .primary-btn:hover {
      background: #2980b9;
    }
    
    .secondary-btn {
      background: #ecf0f1;
      color: #5a6c7d;
    }
    
    .secondary-btn:hover {
      background: #d5dbdb;
    }
    
    @media (max-width: 768px) {
      .matches-modal .modal-content {
        width: 98%;
        margin: 1%;
      }
      
      .matches-grid {
        grid-template-columns: 1fr;
      }
      
      .match-comparison {
        flex-direction: column;
        gap: 8px;
      }
      
      .match-arrow {
        transform: rotate(90deg);
      }
      
      .summary-stats {
        flex-direction: column;
        align-items: center;
      }
      
      .modal-actions {
        flex-direction: column;
      }
    }
  `;
  
  document.head.appendChild(style);
}

// Add styles for the detailed match preview modal
function addMatchPreviewStyles() {
  if (document.querySelector('#match-preview-styles')) return;
  
  const style = document.createElement('style');
  style.id = 'match-preview-styles';
  style.textContent = `
    .match-preview-modal {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.85);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 11000;
      animation: fadeIn 0.3s ease-out;
    }
    
    .preview-content {
      background: white;
      border-radius: 16px;
      width: 95%;
      max-width: 1200px;
      max-height: 95vh;
      overflow: hidden;
      box-shadow: 0 30px 60px rgba(0, 0, 0, 0.4);
      display: flex;
      flex-direction: column;
      animation: slideUp 0.3s ease-out;
    }
    
    .preview-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 24px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
    }
    
    .preview-header h2 {
      margin: 0;
      font-size: 1.4em;
    }
    
    .preview-close-btn {
      background: rgba(255, 255, 255, 0.2);
      border: none;
      color: white;
      font-size: 24px;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s;
    }
    
    .preview-close-btn:hover {
      background: rgba(255, 255, 255, 0.3);
      transform: scale(1.1);
    }
    
    .match-confidence-display {
      padding: 20px 24px;
      background: #f8f9fa;
      border-bottom: 1px solid #e9ecef;
    }
    
    .confidence-meter {
      position: relative;
      background: #e9ecef;
      border-radius: 20px;
      height: 40px;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    
    .confidence-bar {
      position: absolute;
      left: 0;
      top: 0;
      height: 100%;
      border-radius: 20px;
      transition: width 0.8s ease-out;
    }
    
    .confidence-meter.high .confidence-bar {
      background: linear-gradient(90deg, #27ae60, #2ecc71);
    }
    
    .confidence-meter.medium .confidence-bar {
      background: linear-gradient(90deg, #f39c12, #e67e22);
    }
    
    .confidence-meter.low .confidence-bar {
      background: linear-gradient(90deg, #3498db, #2980b9);
    }
    
    .confidence-text {
      position: relative;
      z-index: 2;
      font-weight: bold;
      color: white;
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
    }
    
    .detailed-comparison {
      display: flex;
      gap: 20px;
      padding: 24px;
      flex: 1;
      overflow-y: auto;
    }
    
    .post-detail {
      flex: 1;
      background: #f8f9fa;
      border-radius: 12px;
      padding: 20px;
      border: 2px solid #e9ecef;
    }
    
    .detail-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    }
    
    .post-type-badge {
      padding: 6px 12px;
      border-radius: 20px;
      font-size: 0.8em;
      font-weight: bold;
      color: white;
    }
    
    .post-type-badge.lost {
      background: linear-gradient(135deg, #e74c3c, #c0392b);
    }
    
    .post-type-badge.found {
      background: linear-gradient(135deg, #27ae60, #229954);
    }
    
    .post-date {
      font-size: 0.85em;
      color: #7f8c8d;
    }
    
    .post-detail h3 {
      margin: 0 0 16px 0;
      color: #2c3e50;
      font-size: 1.3em;
      line-height: 1.3;
    }
    
    .post-image-container {
      margin-bottom: 16px;
      border-radius: 8px;
      overflow: hidden;
      background: #ecf0f1;
    }
    
    .post-preview-image {
      width: 100%;
      height: 200px;
      object-fit: cover;
      border-radius: 8px;
    }
    
    .no-image-placeholder {
      height: 200px;
      background: #ecf0f1;
      border-radius: 8px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: #95a5a6;
      margin-bottom: 16px;
    }
    
    .no-image-placeholder i {
      font-size: 3em;
      margin-bottom: 8px;
    }
    
    .post-description {
      margin-bottom: 16px;
    }
    
    .post-description strong {
      color: #2c3e50;
      display: block;
      margin-bottom: 8px;
    }
    
    .post-description p {
      margin: 0;
      color: #5a6c7d;
      line-height: 1.5;
    }
    
    .post-location {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 16px;
      color: #e74c3c;
      font-weight: 500;
    }
    
    .post-labels strong {
      color: #2c3e50;
      display: block;
      margin-bottom: 8px;
    }
    
    .labels-list {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    
    .label-tag {
      background: #3498db;
      color: white;
      padding: 4px 10px;
      border-radius: 12px;
      font-size: 0.8em;
      font-weight: 500;
    }
    
    .match-divider {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-width: 60px;
      position: relative;
    }
    
    .match-connection-line {
      width: 2px;
      flex: 1;
      background: linear-gradient(to bottom, #3498db, #2980b9);
      min-height: 100px;
    }
    
    .match-icon {
      background: white;
      border: 3px solid #3498db;
      border-radius: 50%;
      width: 50px;
      height: 50px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.2em;
      position: absolute;
      top: 50%;
      transform: translateY(-50%);
    }
    
    .matching-analysis {
      padding: 24px;
      background: #f8f9fa;
      border-top: 1px solid #e9ecef;
    }
    
    .matching-analysis h4 {
      margin: 0 0 16px 0;
      color: #2c3e50;
    }
    
    .factors-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 12px;
    }
    
    .factor-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px;
      background: white;
      border-radius: 8px;
      border-left: 4px solid #27ae60;
    }
    
    .factor-item i {
      color: #27ae60;
      font-size: 1.1em;
    }
    
    .preview-actions {
      display: flex;
      gap: 16px;
      justify-content: space-between;
      padding: 24px;
      background: white;
      border-top: 1px solid #e9ecef;
    }
    
    .action-btn {
      padding: 12px 24px;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-weight: 500;
      font-size: 1em;
      display: flex;
      align-items: center;
      gap: 8px;
      transition: all 0.2s;
      flex: 1;
      justify-content: center;
    }
    
    .action-btn.primary {
      background: linear-gradient(135deg, #3498db, #2980b9);
      color: white;
    }
    
    .action-btn.primary:hover {
      background: linear-gradient(135deg, #2980b9, #21618c);
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(52, 152, 219, 0.3);
    }
    
    .action-btn.secondary {
      background: #ecf0f1;
      color: #5a6c7d;
    }
    
    .action-btn.secondary:hover {
      background: #d5dbdb;
      transform: translateY(-1px);
    }
    
    @media (max-width: 768px) {
      .detailed-comparison {
        flex-direction: column;
        gap: 16px;
      }
      
      .match-divider {
        flex-direction: row;
        min-width: auto;
        height: 60px;
        width: 100%;
      }
      
      .match-connection-line {
        width: 100%;
        height: 2px;
        min-height: auto;
      }
      
      .factors-grid {
        grid-template-columns: 1fr;
      }
      
      .preview-actions {
        flex-direction: column;
      }
    }
  `;
  
  document.head.appendChild(style);
}

// Enhanced Match Suggestion Modal Functions
function showMatchSuggestionModal(myPost, matchedPost, sharedLabels) {
  const modal = document.getElementById('matchSuggestionModal');
  const yourPostDetails = document.getElementById('yourPostDetails');
  const matchedPostDetails = document.getElementById('matchedPostDetails');
  const sharedLabelsSpan = document.getElementById('sharedLabels');

  // Populate your post details
  yourPostDetails.innerHTML = `
    <div class="post-title">${escapeHtml(myPost.title)}</div>
    ${myPost.imageData ? 
      `<img src="${myPost.imageData}" alt="${escapeHtml(myPost.title)}" class="post-image" 
            onerror="this.onerror=null;this.src='default-image.png';" />` : 
      ''
    }
    ${myPost.description ? 
      `<div class="post-description">${escapeHtml(myPost.description)}</div>` : 
      ''
    }
    <div class="post-labels">
      ${(myPost.labels || []).map(l => `<span class="label">${escapeHtml(l)}</span>`).join('')}
    </div>
  `;

  // Populate matched post details
  matchedPostDetails.innerHTML = `
    <div class="post-title">${escapeHtml(matchedPost.title)}</div>
    ${matchedPost.imageData ? 
      `<img src="${matchedPost.imageData}" alt="${escapeHtml(matchedPost.title)}" class="post-image" 
            onerror="this.onerror=null;this.src='default-image.png';" />` : 
      ''
    }
    ${matchedPost.description ? 
      `<div class="post-description">${escapeHtml(matchedPost.description)}</div>` : 
      ''
    }
    <div class="post-labels">
      ${(matchedPost.labels || []).map(l => `<span class="label">${escapeHtml(l)}</span>`).join('')}
    </div>
  `;

  // Show shared labels
  sharedLabelsSpan.textContent = sharedLabels.join(', ');

  // Set up button handlers
  document.getElementById('viewMatchDetailsBtn').onclick = () => {
    modal.style.display = 'none';
    window.location.href = `post-details.html?id=${encodeURIComponent(matchedPost.id)}&matchedWith=${encodeURIComponent(myPost.id)}`;
  };

  document.getElementById('dismissMatchBtn').onclick = () => {
    modal.style.display = 'none';
  };

  document.getElementById('closeMatchModal').onclick = () => {
    modal.style.display = 'none';
  };

  modal.style.display = 'flex';
}

// Auto-suggestion system for browsing users
let suggestionTimeouts = new Set();

// Multilingual dictionary for common lost items
const multilingualDictionary = {
  // Writing instruments
  'pen': ['boli', 'bolígrafo', 'stylo', 'pluma', 'escribir'],
  'boli': ['pen', 'stylo', 'bolígrafo', 'pluma', 'writing'],
  'stylo': ['pen', 'boli', 'bolígrafo', 'pluma', 'writing'],
  'pencil': ['lápiz', 'crayon', 'llapis'],
  'lápiz': ['pencil', 'crayon', 'llapis'],
  
  // Colors
  'red': ['rojo', 'rouge', 'vermell', 'roig'],
  'rojo': ['red', 'rouge', 'vermell', 'roig'],
  'rouge': ['red', 'rojo', 'vermell', 'roig'],
  'vermell': ['red', 'rojo', 'rouge', 'roig'],
  'blue': ['azul', 'bleu', 'blau'],
  'azul': ['blue', 'bleu', 'blau'],
  'bleu': ['blue', 'azul', 'blau'],
  'blau': ['blue', 'azul', 'bleu'],
  'black': ['negro', 'noir', 'negre'],
  'negro': ['black', 'noir', 'negre'],
  'noir': ['black', 'negro', 'negre'],
  'negre': ['black', 'negro', 'noir'],
  'white': ['blanco', 'blanc'],
  'blanco': ['white', 'blanc'],
  'blanc': ['white', 'blanco'],
  'green': ['verde', 'vert', 'verd'],
  'verde': ['green', 'vert', 'verd'],
  'vert': ['green', 'verde', 'verd'],
  'verd': ['green', 'verde', 'vert'],
  
  // Electronics
  'phone': ['teléfono', 'móvil', 'mòbil', 'portable', 'celular'],
  'teléfono': ['phone', 'móvil', 'mòbil', 'portable', 'celular'],
  'móvil': ['phone', 'teléfono', 'mòbil', 'portable', 'celular'],
  'mòbil': ['phone', 'teléfono', 'móvil', 'portable', 'celular'],
  'portable': ['phone', 'teléfono', 'móvil', 'mòbil', 'celular'],
  'laptop': ['portátil', 'ordenador', 'ordinador', 'computer'],
  'portátil': ['laptop', 'ordenador', 'ordinador', 'computer'],
  'ordenador': ['laptop', 'portátil', 'ordinador', 'computer'],
  'ordinador': ['laptop', 'portátil', 'ordenador', 'computer'],
  'headphones': ['auriculares', 'cascos', 'headset'],
  'auriculares': ['headphones', 'cascos', 'headset'],
  'cascos': ['headphones', 'auriculares', 'headset'],
  
  // Clothing
  'jacket': ['chaqueta', 'cazadora', 'americana', 'jaqueta'],
  'chaqueta': ['jacket', 'cazadora', 'americana', 'jaqueta'],
  'jaqueta': ['jacket', 'chaqueta', 'cazadora', 'americana'],
  'shirt': ['camisa', 'camiseta'],
  'camisa': ['shirt', 'camiseta'],
  'camiseta': ['shirt', 'camisa'],
  'shoes': ['zapatos', 'zapatillas', 'sabates'],
  'zapatos': ['shoes', 'zapatillas', 'sabates'],
  'zapatillas': ['shoes', 'zapatos', 'sabates'],
  'sabates': ['shoes', 'zapatos', 'zapatillas'],
  
  // Accessories
  'bag': ['bolso', 'mochila', 'bolsa', 'motxilla'],
  'bolso': ['bag', 'mochila', 'bolsa', 'motxilla'],
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
  'montre': ['watch', 'reloj'],
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

// Calculate enhanced similarity between two posts
function calculateEnhancedSimilarity(post1, post2) {
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
    matchingFactors: getMatchingFactors(scores, directMatches, semanticMatches, commonWords),
    directMatches,
    semanticMatches
  };
}

// Get human-readable matching factors
function getMatchingFactors(scores, directMatches, semanticMatches, commonWords) {
  const factors = [];
  
  if (scores.labelMatch > 0) {
    factors.push(`Direct label match (${directMatches.join(', ')})`);
  }
  
  if (scores.semanticMatch > 0) {
    factors.push(`Multilingual similarity (${semanticMatches} translations)`);
  }
  
  if (scores.textSimilarity > 0) {
    factors.push(`Text similarity (${commonWords.length} common words)`);
  }
  
  if (scores.locationMatch > 0) {
    factors.push('Location proximity');
  }
  
  return factors;
}

function checkForMatchSuggestions(userPosts, allPosts) {
  if (!currentUser || !userPosts.length) return;

  const otherPosts = Object.entries(allPosts)
    .filter(([, post]) => post.user?.uid !== currentUser.uid)
    .map(([id, post]) => ({ id, ...post }));

  let bestMatches = [];

  for (const myPost of userPosts) {
    const myType = myPost.type?.toLowerCase();
    if (myType !== "lost" && myType !== "found") continue;

    for (const otherPost of otherPosts) {
      const otherType = otherPost.type?.toLowerCase();
      if (!otherType || myType === otherType) continue;

      // Calculate comprehensive similarity
      const similarity = calculateEnhancedSimilarity(myPost, otherPost);
      
      // Consider it a match if confidence is above 15% (more lenient threshold)
      if (similarity.confidence >= 15) {
        bestMatches.push({
          myPost,
          otherPost,
          similarity,
          timestamp: Date.now()
        });
      }
    }
  }

  // Sort by confidence and show the best match
  if (bestMatches.length > 0) {
    bestMatches.sort((a, b) => b.similarity.confidence - a.similarity.confidence);
    const bestMatch = bestMatches[0];
    
    // Show suggestion popup after a delay
    const timeoutId = setTimeout(() => {
      showEnhancedMatchSuggestionPopup(bestMatch);
      suggestionTimeouts.delete(timeoutId);
    }, 3000);
    
    suggestionTimeouts.add(timeoutId);
  }
}

function showEnhancedMatchSuggestionPopup(matchData) {
  // Remove any existing popup
  const existingPopup = document.querySelector('.match-suggestion-popup');
  if (existingPopup) {
    existingPopup.remove();
  }

  const { myPost, otherPost, similarity } = matchData;
  const isMyPostLost = myPost.type?.toLowerCase() === 'lost';
  
  // Determine confidence level and styling
  let confidenceClass = 'low';
  let confidenceText = 'Potential Match';
  
  if (similarity.confidence >= 70) {
    confidenceClass = 'high';
    confidenceText = 'High Confidence';
  } else if (similarity.confidence >= 40) {
    confidenceClass = 'medium';
    confidenceText = 'Good Match';
  }

  const popup = document.createElement('div');
  popup.className = 'match-suggestion-popup';
  popup.innerHTML = `
    <div class="popup-content">
      <div class="popup-header">
        <h3>🎯 ${confidenceText} Found!</h3>
        <button class="close-btn" onclick="dismissSuggestion()">×</button>
      </div>
      
      <div class="match-info">
        <div class="confidence-score ${confidenceClass}">
          ${similarity.confidence}% Match
        </div>
        
        <div class="posts-comparison">
          <div class="post-summary my-post">
            <span class="post-type ${myPost.type}">${myPost.type.toUpperCase()}</span>
            <h4>${myPost.title}</h4>
            <p>${myPost.description || 'No description'}</p>
          </div>
          
          <div class="match-arrow">↔</div>
          
          <div class="post-summary other-post">
            <span class="post-type ${otherPost.type}">${otherPost.type.toUpperCase()}</span>
            <h4>${otherPost.title}</h4>
            <p>${otherPost.description || 'No description'}</p>
          </div>
        </div>
        
        <div class="matching-factors">
          <h5>Why this matches:</h5>
          <ul>
            ${similarity.matchingFactors.map(factor => `<li>${factor}</li>`).join('')}
          </ul>
        </div>
      </div>
      
      <div class="popup-actions">
        <button class="view-btn" onclick="viewSuggestionMatch('${otherPost.id}', '${myPost.id}')">
          View Details
        </button>
        <button class="dismiss-btn" onclick="dismissSuggestion()">
          Maybe Later
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(popup);

  // Add enhanced styling for the popup
  const style = document.createElement('style');
  style.textContent = `
    .match-suggestion-popup {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.7);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 10000;
      animation: fadeIn 0.3s ease-out;
    }
    
    .popup-content {
      background: white;
      border-radius: 12px;
      padding: 24px;
      max-width: 600px;
      width: 90%;
      max-height: 80vh;
      overflow-y: auto;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
      animation: slideUp 0.3s ease-out;
    }
    
    .popup-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
      padding-bottom: 15px;
      border-bottom: 2px solid #f0f0f0;
    }
    
    .popup-header h3 {
      margin: 0;
      color: #2c3e50;
      font-size: 1.3em;
    }
    
    .close-btn {
      background: none;
      border: none;
      font-size: 24px;
      cursor: pointer;
      color: #7f8c8d;
      padding: 0;
      width: 30px;
      height: 30px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    
    .close-btn:hover {
      background: #ecf0f1;
      color: #e74c3c;
    }
    
    .confidence-score {
      text-align: center;
      font-size: 1.5em;
      font-weight: bold;
      padding: 12px;
      border-radius: 8px;
      margin-bottom: 20px;
    }
    
    .confidence-score.high {
      background: linear-gradient(135deg, #27ae60, #2ecc71);
      color: white;
    }
    
    .confidence-score.medium {
      background: linear-gradient(135deg, #f39c12, #e67e22);
      color: white;
    }
    
    .confidence-score.low {
      background: linear-gradient(135deg, #3498db, #2980b9);
      color: white;
    }
    
    .posts-comparison {
      display: flex;
      align-items: center;
      gap: 15px;
      margin-bottom: 20px;
      flex-wrap: wrap;
    }
    
    .post-summary {
      flex: 1;
      min-width: 200px;
      padding: 15px;
      border-radius: 8px;
      border: 2px solid #ecf0f1;
    }
    
    .post-summary h4 {
      margin: 8px 0 5px 0;
      color: #2c3e50;
      font-size: 1.1em;
    }
    
    .post-summary p {
      margin: 0;
      color: #7f8c8d;
      font-size: 0.9em;
      line-height: 1.4;
    }
    
    .post-type {
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 0.8em;
      font-weight: bold;
      text-transform: uppercase;
    }
    
    .post-type.lost {
      background: #e74c3c;
      color: white;
    }
    
    .post-type.found {
      background: #27ae60;
      color: white;
    }
    
    .match-arrow {
      font-size: 1.5em;
      color: #3498db;
      font-weight: bold;
      flex-shrink: 0;
    }
    
    .matching-factors {
      background: #f8f9fa;
      padding: 15px;
      border-radius: 8px;
      margin-bottom: 20px;
    }
    
    .matching-factors h5 {
      margin: 0 0 10px 0;
      color: #2c3e50;
    }
    
    .matching-factors ul {
      margin: 0;
      padding-left: 20px;
    }
    
    .matching-factors li {
      color: #5a6c7d;
      margin-bottom: 5px;
    }
    
    .popup-actions {
      display: flex;
      gap: 12px;
      justify-content: flex-end;
    }
    
    .view-btn, .dismiss-btn {
      padding: 12px 24px;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-weight: 500;
      transition: all 0.2s;
    }
    
    .view-btn {
      background: #3498db;
      color: white;
    }
    
    .view-btn:hover {
      background: #2980b9;
      transform: translateY(-1px);
    }
    
    .dismiss-btn {
      background: #ecf0f1;
      color: #7f8c8d;
    }
    
    .dismiss-btn:hover {
      background: #d5dbdb;
    }
    
    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    
    @keyframes slideUp {
      from { transform: translateY(30px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
    
    @media (max-width: 768px) {
      .posts-comparison {
        flex-direction: column;
      }
      
      .match-arrow {
        transform: rotate(90deg);
      }
      
      .popup-actions {
        flex-direction: column;
      }
    }
  `;
  
  // Only add style if it doesn't exist
  if (!document.querySelector('#match-popup-styles')) {
    style.id = 'match-popup-styles';
    document.head.appendChild(style);
  }
}

// Global functions for match suggestion popup
window.viewSuggestionMatch = function(otherPostId, myPostId) {
  dismissSuggestion();
  window.location.href = `post-details.html?id=${encodeURIComponent(otherPostId)}&matchedWith=${encodeURIComponent(myPostId)}`;
};

window.dismissSuggestion = function() {
  const popup = document.querySelector('.match-suggestion-popup');
  if (popup) {
    popup.remove();
  }
};

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




























