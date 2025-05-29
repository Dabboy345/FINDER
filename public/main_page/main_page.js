import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";
import { getDatabase, ref, get, set, push, onValue, update } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-database.js";
import { analyzeSimilarity } from './openai-service.js';

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

  try {
    const postRef = ref(db, `posts/${postId}`);
    await update(postRef, {
      claimed: false,
      claimedBy: null
    });
    alert("You have unclaimed this item.");
  } catch (error) {
    console.error("Error unclaiming item:", error);
    alert("Error unclaiming item. Please try again.");
  }
}

// Modal logic
let currentClaimPostId = null;
let currentClaimPost = null;

// Function to check if user has already claimed a post
async function hasUserClaimedPost(postId, userId) {
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

  // Fetch all notifications to avoid duplicate match notifications
  const notificationsSnapshot = await get(ref(db, 'notifications'));
  const notificationsData = notificationsSnapshot.val() || {};

  // Helper to check if a match notification already exists for a user and post
  function hasMatchNotification(userId, postId) {
    return Object.values(notificationsData).some(
      n => n.to === userId && n.type === 'match' && n.postId === postId
    );
  }

  // Separate user's posts and others'
  const myPosts = [];
  const otherPosts = [];
  for (const [id, post] of Object.entries(postsData)) {
    if (post.user && post.user.uid === currentUser.uid) {
      myPosts.push({ id, ...post });
    } else {
      otherPosts.push({ id, ...post });
    }
  }

  if (myPosts.length === 0) {
    alert("You need to create a post first to find matches.");
    return;
  }

  // Try to find matches for each of the user's posts
  let foundMatch = false;
  let matchInfo = null;
  for (const myPost of myPosts) {
    const myType = myPost.type?.toLowerCase();
    if (myType !== "lost" && myType !== "found") continue;
    const myLabels = (myPost.labels || []).map(l => l.toLowerCase());

    for (const otherPost of otherPosts) {
      const otherType = otherPost.type?.toLowerCase();
      if (!otherType || myType === otherType) continue;
      const otherLabels = (otherPost.labels || []).map(l => l.toLowerCase());

      // Find shared labels (excluding "lost"/"found")
      const shared = myLabels.filter(
        l => l !== "lost" && l !== "found" && otherLabels.includes(l)
      );
      if (shared.length > 0) {
        foundMatch = true;
        matchInfo = { myPost, otherPost, shared, myType, otherType };
        const notificationsRef = ref(db, 'notifications');
        // Notify current user if not already notified
        if (!hasMatchNotification(currentUser.uid, otherPost.id)) {
          await push(notificationsRef, {
            to: currentUser.uid,
            title: 'Potential Match Found!',
            message: `We found a matching "${otherType}" post: "${otherPost.title}" with labels: ${shared.join(", ")}`,
            type: 'match',
            postId: otherPost.id,
            matchedWithId: myPost.id,
            timestamp: Date.now(),
            read: false
          });
        }
        // Notify other user if not already notified
        if (otherPost.user && otherPost.user.uid && !hasMatchNotification(otherPost.user.uid, myPost.id)) {
          await push(notificationsRef, {
            to: otherPost.user.uid,
            title: 'Potential Match Found!',
            message: `We found a matching "${myType}" post: "${myPost.title}" with labels: ${shared.join(", ")}`,
            type: 'match',
            postId: myPost.id,
            matchedWithId: otherPost.id,
            timestamp: Date.now(),
            read: false
          });
        }
        // Show the enhanced match modal
        showMatchSuggestionModal(myPost, otherPost, shared);
        break;
      }
    }
    if (foundMatch) {
      break;
    }
  }
  if (!foundMatch) {
    alert("No matches found based on labels. Keep checking back as new posts are added!");
  }
});

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

function checkForMatchSuggestions(userPosts, allPosts) {
  if (!currentUser || !userPosts.length) return;

  const otherPosts = Object.entries(allPosts)
    .filter(([, post]) => post.user?.uid !== currentUser.uid)
    .map(([id, post]) => ({ id, ...post }));

  for (const myPost of userPosts) {
    const myType = myPost.type?.toLowerCase();
    if (myType !== "lost" && myType !== "found") continue;
    const myLabels = (myPost.labels || []).map(l => l.toLowerCase());

    for (const otherPost of otherPosts) {
      const otherType = otherPost.type?.toLowerCase();
      if (!otherType || myType === otherType) continue;
      const otherLabels = (otherPost.labels || []).map(l => l.toLowerCase());

      // Find shared labels (excluding "lost"/"found")
      const shared = myLabels.filter(
        l => l !== "lost" && l !== "found" && otherLabels.includes(l)
      );
      
      if (shared.length > 0) {
        // Show suggestion popup after a delay
        const timeoutId = setTimeout(() => {
          showMatchSuggestionPopup(myPost, otherPost, shared);
          suggestionTimeouts.delete(timeoutId);
        }, 3000); // Show after 3 seconds of browsing
        
        suggestionTimeouts.add(timeoutId);
        return; // Show only one suggestion at a time
      }
    }
  }
}

function showMatchSuggestionPopup(myPost, matchedPost, sharedLabels) {
  // Remove any existing popup
  const existingPopup = document.querySelector('.match-suggestion-popup');
  if (existingPopup) {
    existingPopup.remove();
  }

  const popup = document.createElement('div');
  popup.className = 'match-suggestion-popup';
  popup.innerHTML = `
    <div class="suggestion-header">
      <i class="fas fa-lightbulb"></i>
      <span>Possible Match Found!</span>
    </div>
    <div class="suggestion-content">
      <p><strong>Your post:</strong> ${escapeHtml(myPost.title)}</p>
      <p><strong>Potential match:</strong> ${escapeHtml(matchedPost.title)}</p>
      <p><strong>Common tags:</strong> ${sharedLabels.join(', ')}</p>
    </div>
    <div class="suggestion-actions">
      <button class="suggestion-view" onclick="viewSuggestionMatch('${matchedPost.id}', '${myPost.id}')">
        <i class="fas fa-eye"></i> View
      </button>
      <button class="suggestion-dismiss" onclick="dismissSuggestion()">
        <i class="fas fa-times"></i> Dismiss
      </button>
    </div>
  `;

  document.body.appendChild(popup);

  // Auto-dismiss after 15 seconds
  setTimeout(() => {
    if (popup.parentNode) {
      popup.remove();
    }
  }, 15000);
}

// Global functions for suggestion popup
window.viewSuggestionMatch = (matchedPostId, myPostId) => {
  dismissSuggestion();
  window.location.href = `post-details.html?id=${encodeURIComponent(matchedPostId)}&matchedWith=${encodeURIComponent(myPostId)}`;
};

window.dismissSuggestion = () => {
  const popup = document.querySelector('.match-suggestion-popup');
  if (popup) {
    popup.remove();
  }
};

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

  checkForMatchSuggestions(myPosts, postsData);
});

// Enhanced AI-Powered Recommendation System
class AIRecommendationEngine {
  constructor() {
    this.weightings = {
      exactMatch: 12,
      semanticSimilarity: 10,
      visualSimilarity: 8,
      descriptionMatch: 7,
      categoryMatch: 6,
      colorMatch: 5,
      sizeMatch: 4,
      locationProximity: 4,
      temporalRelevance: 3,
      brandMatch: 6
    };
    
    // Enhanced semantic groups with more comprehensive categorization
    this.semanticGroups = {
      electronics: {
        main: ['phone', 'mobile', 'smartphone', 'iphone', 'android', 'tablet', 'laptop', 'computer', 'pc', 'macbook'],
        accessories: ['headphones', 'earbuds', 'airpods', 'charger', 'cable', 'mouse', 'keyboard', 'case', 'cover'],
        devices: ['camera', 'smartwatch', 'fitness tracker', 'bluetooth speaker', 'powerbank', 'adapter']
      },
      accessories: {
        jewelry: ['watch', 'ring', 'necklace', 'bracelet', 'earrings', 'jewelry', 'chain', 'pendant'],
        eyewear: ['glasses', 'sunglasses', 'spectacles', 'reading glasses', 'contacts'],
        personal: ['hair clip', 'hair band', 'belt', 'tie', 'scarf', 'hat', 'cap', 'beanie']
      },
      clothing: {
        tops: ['shirt', 'blouse', 't-shirt', 'tshirt', 'sweater', 'hoodie', 'jacket', 'coat', 'blazer'],
        bottoms: ['pants', 'jeans', 'shorts', 'skirt', 'dress', 'trousers', 'leggings'],
        footwear: ['shoes', 'sneakers', 'boots', 'sandals', 'heels', 'flats', 'slippers'],
        undergarments: ['socks', 'underwear', 'bra', 'stockings']
      },
      bags: {
        daily: ['backpack', 'purse', 'handbag', 'shoulder bag', 'tote bag', 'messenger bag'],
        travel: ['suitcase', 'luggage', 'duffle bag', 'carry-on', 'briefcase'],
        small: ['wallet', 'purse', 'clutch', 'coin purse', 'card holder']
      },
      keys: ['keys', 'keychain', 'car keys', 'house keys', 'office keys', 'remote', 'key fob', 'access card'],
      documents: ['id', 'passport', 'license', 'driving license', 'card', 'credit card', 'document', 'paper', 'certificate', 'ticket'],
      pets: ['dog', 'cat', 'pet', 'animal', 'puppy', 'kitten', 'bird', 'hamster', 'rabbit'],
      sports: ['ball', 'basketball', 'football', 'soccer ball', 'tennis ball', 'golf ball', 'equipment', 'racket', 'bat'],
      vehicles: ['car', 'bike', 'bicycle', 'motorcycle', 'scooter', 'skateboard']
    };

    // Color variations and synonyms
    this.colorVariations = {
      red: ['red', 'crimson', 'scarlet', 'burgundy', 'maroon', 'cherry'],
      blue: ['blue', 'navy', 'azure', 'cobalt', 'turquoise', 'teal', 'cyan'],
      green: ['green', 'lime', 'olive', 'emerald', 'forest', 'mint'],
      yellow: ['yellow', 'gold', 'golden', 'amber', 'lemon', 'cream'],
      black: ['black', 'dark', 'charcoal', 'ebony', 'jet'],
      white: ['white', 'cream', 'ivory', 'pearl', 'snow'],
      brown: ['brown', 'tan', 'beige', 'khaki', 'bronze', 'chocolate'],
      gray: ['gray', 'grey', 'silver', 'ash', 'slate'],
      purple: ['purple', 'violet', 'lavender', 'plum', 'magenta'],
      pink: ['pink', 'rose', 'salmon', 'coral', 'fuchsia'],
      orange: ['orange', 'coral', 'peach', 'tangerine', 'rust']
    };

    // Size indicators
    this.sizeTerms = {
      small: ['small', 'mini', 'tiny', 'little', 'compact', 'petite'],
      medium: ['medium', 'regular', 'standard', 'normal', 'average'],
      large: ['large', 'big', 'huge', 'giant', 'oversized', 'xl', 'xxl']
    };

    // Brand patterns
    this.commonBrands = [
      'apple', 'samsung', 'google', 'microsoft', 'sony', 'nike', 'adidas', 'puma',
      'louis vuitton', 'gucci', 'prada', 'chanel', 'rolex', 'casio', 'fossil',
      'dell', 'hp', 'lenovo', 'asus', 'acer', 'canon', 'nikon'
    ];
  }

  // Enhanced semantic similarity calculation
  calculateSemanticSimilarity(text1, text2) {
    const words1 = this.extractKeywords(text1.toLowerCase());
    const words2 = this.extractKeywords(text2.toLowerCase());
    
    let exactMatches = 0;
    let semanticMatches = 0;
    let categoryMatches = 0;
    
    // Calculate exact word matches
    words1.forEach(word1 => {
      if (words2.includes(word1)) {
        exactMatches++;
      } else {
        // Check semantic groups with hierarchical matching
        this.findSemanticMatches(word1, words2, (match, strength) => {
          semanticMatches += strength;
        });
      }
    });
    
    const totalWords = Math.max(words1.length, words2.length, 1);
    const exactScore = exactMatches / totalWords;
    const semanticScore = semanticMatches / totalWords;
    
    return Math.min(exactScore + semanticScore * 0.7, 1);
  }

  // Find semantic matches with different strength levels
  findSemanticMatches(word, targetWords, callback) {
    for (const [category, subcategories] of Object.entries(this.semanticGroups)) {
      if (typeof subcategories === 'object' && !Array.isArray(subcategories)) {
        // Handle subcategorized groups
        for (const [subcat, items] of Object.entries(subcategories)) {
          if (items.includes(word)) {
            targetWords.forEach(targetWord => {
              if (items.includes(targetWord) && word !== targetWord) {
                callback(targetWord, 0.9); // High similarity within same subcategory
              } else {
                // Check other subcategories in same category
                for (const [otherSubcat, otherItems] of Object.entries(subcategories)) {
                  if (otherSubcat !== subcat && otherItems.includes(targetWord)) {
                    callback(targetWord, 0.6); // Medium similarity within same category
                  }
                }
              }
            });
          }
        }
      } else if (Array.isArray(subcategories)) {
        // Handle simple arrays
        if (subcategories.includes(word)) {
          targetWords.forEach(targetWord => {
            if (subcategories.includes(targetWord) && word !== targetWord) {
              callback(targetWord, 0.8);
            }
          });
        }
      }
    }
  }

  // Extract meaningful keywords from text
  extractKeywords(text) {
    const stopWords = ['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'was', 'are', 'were', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'my', 'your', 'his', 'her', 'its', 'our', 'their'];
    return text.split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.includes(word))
      .map(word => word.replace(/[^\w]/g, ''));
  }

  // Enhanced visual similarity with comprehensive analysis
  calculateVisualSimilarity(post1, post2) {
    let visualScore = 0;
    let confidenceFactors = [];
    
    // Image presence analysis
    const post1HasImage = post1.imageData && post1.imageData.length > 1000;
    const post2HasImage = post2.imageData && post2.imageData.length > 1000;
    
    if (post1HasImage && post2HasImage) {
      visualScore += 0.25;
      confidenceFactors.push('Both have images');
      
      // Advanced image analysis simulation
      const imageAnalysis = this.analyzeImageCharacteristics(post1, post2);
      visualScore += imageAnalysis.score;
      confidenceFactors.push(...imageAnalysis.factors);
    } else if (post1HasImage || post2HasImage) {
      // One has image, use text-based visual cues
      visualScore += 0.1;
    }
    
    // Color matching with variations
    const colorMatch = this.calculateColorSimilarity(post1, post2);
    visualScore += colorMatch.score;
    if (colorMatch.matches.length > 0) {
      confidenceFactors.push(`Color match: ${colorMatch.matches.join(', ')}`);
    }
    
    // Size and dimension analysis
    const sizeMatch = this.calculateSizeSimilarity(post1, post2);
    visualScore += sizeMatch.score;
    if (sizeMatch.category) {
      confidenceFactors.push(`Size category: ${sizeMatch.category}`);
    }
    
    // Material and texture analysis
    const materialMatch = this.calculateMaterialSimilarity(post1, post2);
    visualScore += materialMatch.score;
    if (materialMatch.materials.length > 0) {
      confidenceFactors.push(`Materials: ${materialMatch.materials.join(', ')}`);
    }
    
    return {
      score: Math.min(visualScore, 1),
      factors: confidenceFactors,
      details: {
        hasImages: post1HasImage && post2HasImage,
        colorMatches: colorMatch.matches,
        sizeCategory: sizeMatch.category,
        materials: materialMatch.materials
      }
    };
  }

  // Simulate advanced image analysis
  analyzeImageCharacteristics(post1, post2) {
    let score = 0;
    let factors = [];
    
    // Image size comparison (basic)
    const size1 = post1.imageData.length;
    const size2 = post2.imageData.length;
    const sizeDiff = Math.abs(size1 - size2) / Math.max(size1, size2);
    
    if (sizeDiff < 0.3) {
      score += 0.15;
      factors.push('Similar image complexity');
    }
    
    // Image format analysis (basic)
    const format1 = this.getImageFormat(post1.imageData);
    const format2 = this.getImageFormat(post2.imageData);
    
    if (format1 === format2) {
      score += 0.05;
      factors.push(`Same format: ${format1}`);
    }
    
    // Brightness analysis (simulated)
    const brightness1 = this.estimateBrightness(post1);
    const brightness2 = this.estimateBrightness(post2);
    
    if (Math.abs(brightness1 - brightness2) < 0.3) {
      score += 0.1;
      factors.push('Similar lighting conditions');
    }
    
    return { score, factors };
  }

  // Get image format from data URL
  getImageFormat(imageData) {
    if (imageData.includes('data:image/jpeg')) return 'JPEG';
    if (imageData.includes('data:image/png')) return 'PNG';
    if (imageData.includes('data:image/gif')) return 'GIF';
    if (imageData.includes('data:image/webp')) return 'WebP';
    return 'Unknown';
  }

  // Estimate brightness from description and context
  estimateBrightness(post) {
    const text = (post.title + ' ' + (post.description || '')).toLowerCase();
    const brightTerms = ['bright', 'light', 'white', 'sunny', 'clear', 'shiny'];
    const darkTerms = ['dark', 'black', 'shadow', 'dim', 'night', 'evening'];
    
    const brightCount = brightTerms.filter(term => text.includes(term)).length;
    const darkCount = darkTerms.filter(term => text.includes(term)).length;
    
    // Return value between 0 (dark) and 1 (bright)
    return 0.5 + (brightCount - darkCount) * 0.1;
  }

  // Enhanced color similarity calculation
  calculateColorSimilarity(post1, post2) {
    const text1 = (post1.title + ' ' + (post1.description || '')).toLowerCase();
    const text2 = (post2.title + ' ' + (post2.description || '')).toLowerCase();
    
    let matchedColors = [];
    let score = 0;
    
    // Check for color variations and synonyms
    for (const [baseColor, variations] of Object.entries(this.colorVariations)) {
      const post1HasColor = variations.some(color => text1.includes(color));
      const post2HasColor = variations.some(color => text2.includes(color));
      
      if (post1HasColor && post2HasColor) {
        matchedColors.push(baseColor);
        score += 0.2; // High score for exact color family match
      }
    }
    
    // Check for multi-color descriptions
    const colorPattern = /(multi.*color|rainbow|colorful|various.*color)/i;
    if (colorPattern.test(text1) && colorPattern.test(text2)) {
      matchedColors.push('multicolor');
      score += 0.15;
    }
    
    return {
      score: Math.min(score, 0.5), // Cap at 0.5 for color matching
      matches: matchedColors
    };
  }

  // Calculate size similarity
  calculateSizeSimilarity(post1, post2) {
    const text1 = (post1.title + ' ' + (post1.description || '')).toLowerCase();
    const text2 = (post2.title + ' ' + (post2.description || '')).toLowerCase();
    
    let matchedCategory = null;
    let score = 0;
    
    for (const [sizeCategory, terms] of Object.entries(this.sizeTerms)) {
      const post1HasSize = terms.some(term => text1.includes(term));
      const post2HasSize = terms.some(term => text2.includes(term));
      
      if (post1HasSize && post2HasSize) {
        matchedCategory = sizeCategory;
        score = 0.15;
        break;
      }
    }
    
    // Check for specific measurements (simplified)
    const measurementPattern = /(\d+)\s*(cm|mm|inch|"|'|ft|meter|m)\b/gi;
    const measurements1 = text1.match(measurementPattern) || [];
    const measurements2 = text2.match(measurementPattern) || [];
    
    if (measurements1.length > 0 && measurements2.length > 0) {
      score += 0.1;
      matchedCategory = matchedCategory || 'measured';
    }
    
    return {
      score,
      category: matchedCategory
    };
  }

  // Calculate material similarity
  calculateMaterialSimilarity(post1, post2) {
    const materials = {
      metal: ['metal', 'steel', 'aluminum', 'gold', 'silver', 'brass', 'copper', 'iron'],
      plastic: ['plastic', 'polymer', 'acrylic', 'vinyl', 'pvc'],
      fabric: ['cotton', 'wool', 'silk', 'polyester', 'nylon', 'denim', 'leather', 'suede'],
      glass: ['glass', 'crystal', 'transparent', 'clear'],
      wood: ['wood', 'wooden', 'timber', 'oak', 'pine', 'bamboo'],
      rubber: ['rubber', 'silicone', 'elastic'],
      paper: ['paper', 'cardboard', 'card']
    };
    
    const text1 = (post1.title + ' ' + (post1.description || '')).toLowerCase();
    const text2 = (post2.title + ' ' + (post2.description || '')).toLowerCase();
    
    let matchedMaterials = [];
    let score = 0;
    
    for (const [materialType, terms] of Object.entries(materials)) {
      const post1HasMaterial = terms.some(term => text1.includes(term));
      const post2HasMaterial = terms.some(term => text2.includes(term));
      
      if (post1HasMaterial && post2HasMaterial) {
        matchedMaterials.push(materialType);
        score += 0.1;
      }
    }
    
    return {
      score: Math.min(score, 0.3), // Cap at 0.3 for material matching
      materials: matchedMaterials
    };
  }

  // Enhanced brand detection
  calculateBrandSimilarity(post1, post2) {
    const text1 = (post1.title + ' ' + (post1.description || '')).toLowerCase();
    const text2 = (post2.title + ' ' + (post2.description || '')).toLowerCase();
    
    let matchedBrands = [];
    let score = 0;
    
    for (const brand of this.commonBrands) {
      if (text1.includes(brand) && text2.includes(brand)) {
        matchedBrands.push(brand);
        score += 0.2; // High score for brand matches
      }
    }
    
    return {
      score: Math.min(score, 0.4), // Cap at 0.4 for brand matching
      brands: matchedBrands
    };
  }

  // Add this method to the AIRecommendationEngine class
  async generateRecommendations(userPosts, postsData) {
    // userPosts: array of posts created by the user
    // postsData: all posts in the database (object with postId as key)
    const recommendations = [];
    const allPosts = Object.entries(postsData)
      .map(([id, post]) => ({ id, ...post }))
      .filter(post => post.user && post.user.uid); // Only posts with a user

    for (const userPost of userPosts) {
      for (const otherPost of allPosts) {
        if (userPost.id === otherPost.id) continue; // Skip self
        if (userPost.user.uid === otherPost.user.uid) continue; // Skip own posts
        // Only match lost <-> found
        if (!userPost.type || !otherPost.type || userPost.type === otherPost.type) continue;

        // Compare text and labels for semantic similarity
        const userText = userPost.title + ' ' + (userPost.description || '') + ' ' + (userPost.labels || []).join(' ');
        const otherText = otherPost.title + ' ' + (otherPost.description || '') + ' ' + (otherPost.labels || []).join(' ');
        const semanticScore = this.calculateSemanticSimilarity(userText, otherText);

        // Compare labels directly for overlap
        const userLabels = (userPost.labels || []).map(l => l.toLowerCase());
        const otherLabels = (otherPost.labels || []).map(l => l.toLowerCase());
        const sharedLabels = userLabels.filter(l => otherLabels.includes(l));
        const labelScore = sharedLabels.length > 0 ? Math.min(sharedLabels.length / Math.max(userLabels.length, 1), 1) : 0;

        // Visual and other scores
        const visualScoreObj = this.calculateVisualSimilarity(userPost, otherPost);
        const visualScore = visualScoreObj.score;
        const colorScore = this.calculateColorSimilarity(userPost, otherPost).score;
        const sizeScore = this.calculateSizeSimilarity(userPost, otherPost).score;
        const brandScore = this.calculateBrandSimilarity(userPost, otherPost).score;

        // Weighted total score (give more weight to text+label match)
        const totalScore =
          (semanticScore + labelScore) * (this.weightings.semanticSimilarity + 3) +
          visualScore * this.weightings.visualSimilarity +
          colorScore * this.weightings.colorMatch +
          sizeScore * this.weightings.sizeMatch +
          brandScore * this.weightings.brandMatch;

        // Categorize match
        let matchCategory = 'medium';
        if (totalScore >= 18) matchCategory = 'high';
        else if (visualScore > 0.5) matchCategory = 'visual';

        // Confidence as percentage
        const confidence = Math.min(Math.round((totalScore / 30) * 100), 100);

        // Collect matching factors and feedback
        const matchingFactors = [];
        if (semanticScore > 0.5) matchingFactors.push('Strong text/description similarity');
        if (labelScore > 0.3) matchingFactors.push(`Shared label(s): ${sharedLabels.join(', ')}`);
        if (visualScore > 0.3) matchingFactors.push('Visual similarity');
        if (colorScore > 0.2) matchingFactors.push('Color match');
        if (sizeScore > 0.1) matchingFactors.push('Size match');
        if (brandScore > 0.1) matchingFactors.push('Brand match');

        // User feedback string
        let feedback = '';
        if (semanticScore > 0.7 && labelScore > 0.5) {
          feedback = 'This match is highly relevant based on both text and label similarity.';
        } else if (semanticScore > 0.7) {
          feedback = 'This match is highly relevant based on text and description.';
        } else if (labelScore > 0.5) {
          feedback = 'This match shares several important labels.';
        } else if (visualScore > 0.5) {
          feedback = 'This match looks visually similar.';
        } else if (matchingFactors.length > 0) {
          feedback = 'This match shares some similarities.';
        } else {
          feedback = 'This match is a possible candidate, but not a strong match.';
        }

        // Only add if at least one factor is present
        if (matchingFactors.length > 0) {
          recommendations.push({
            userPost,
            matchedPost: otherPost,
            totalScore,
            matchCategory,
            matchingFactors,
            confidence,
            feedback // Add feedback for user
          });
        }
      }
    }
    // Sort by confidence descending
    recommendations.sort((a, b) => b.confidence - a.confidence);
    return recommendations;
  }
}

// Initialize AI Engine
const aiEngine = new AIRecommendationEngine();

// AI Recommendations UI Management
async function showAIRecommendations() {
  if (!currentUser) {
    alert("Please log in to use AI recommendations.");
    return;
  }

  const section = document.getElementById('aiRecommendationsSection');
  const grid = document.getElementById('recommendationsGrid');
  
  try {
    // Show loading state
    section.style.display = 'block';
    grid.innerHTML = `
      <div class="loading-recommendations">
        <div class="loading-spinner"></div>
        <p>AI is analyzing posts...</p>
      </div>
    `;

    // Get posts data
    const postsSnapshot = await get(ref(db, 'posts'));
    const postsData = postsSnapshot.val();
    
    if (!postsData) {
      grid.innerHTML = '<div class="no-recommendations">No posts available.</div>';
      return;
    }

    // Get user's posts
    const userPosts = Object.entries(postsData)
      .filter(([, post]) => post.user?.uid === currentUser.uid)
      .map(([id, post]) => ({ id, ...post }));

    if (userPosts.length === 0) {
      grid.innerHTML = '<div class="no-recommendations">Create a post first to get recommendations.</div>';
      return;
    }

    // Check per-user and global quota before running recommendations
    if (userAIUsageCount() >= AI_USER_LIMIT_PER_HOUR) {
      grid.innerHTML = '<div class="no-recommendations">You have reached your hourly AI usage limit. Please try again later.</div>';
      // Instead of blocking the UI, just show the message in the recommendations section and allow the rest of the app to work
      section.style.display = 'block';
      return;
    }
    const globalUsage = await getGlobalAIUsage();
    if (globalUsage >= AI_GLOBAL_DAILY_LIMIT) {
      grid.innerHTML = '<div class="no-recommendations">The daily AI usage limit for this app has been reached. Please try again tomorrow.</div>';
      section.style.display = 'block';
      return;
    }

    // Generate and display recommendations using real OpenAI API for each pair
    let recommendations = [];
    let openAICalled = false;
    let rateLimitError = false;
    let apiErrorMessage = '';
    try {
      const allPosts = Object.entries(postsData)
        .map(([id, post]) => ({ id, ...post }))
        .filter(post => post.user && post.user.uid);
      for (const userPost of userPosts) {
        for (const otherPost of allPosts) {
          if (userPost.id === otherPost.id) continue; // Skip self
          if (userPost.user.uid === otherPost.user.uid) continue; // Skip own posts
          if (!userPost.type || !otherPost.type || userPost.type === otherPost.type) continue; // Only match lost <-> found
          try {
            // Call OpenAI API for similarity
            const similarity = await analyzeSimilarity(userPost, otherPost);
            openAICalled = true;
            // Handle OpenAI error objects from compareTexts/compareImages
            if (similarity && (similarity.textSimilarity?.error || similarity.imageSimilarity?.error)) {
              // If rate limited, set flag and break out of loops
              if (
                similarity.textSimilarity?.error === 'rate_limited' ||
                similarity.imageSimilarity?.error === 'rate_limited'
              ) {
                rateLimitError = true;
                apiErrorMessage = similarity.textSimilarity?.message || similarity.imageSimilarity?.message;
                break;
              }
              // For other errors, skip this pair but continue
              continue;
            }
            // Use the OpenAI similarity score as the main confidence
            if (similarity && similarity.overallScore > 0.3) {
              recommendations.push({
                userPost,
                matchedPost: otherPost,
                totalScore: similarity.overallScore * 100,
                matchCategory: similarity.overallScore > 0.7 ? 'high' : (similarity.overallScore > 0.5 ? 'medium' : 'visual'),
                matchingFactors: [
                  `Text similarity: ${Math.round(similarity.textSimilarity * 100)}%`,
                  `Image similarity: ${Math.round(similarity.imageSimilarity.similarity_score * 100)}%`
                ],
                confidence: Math.round(similarity.overallScore * 100),
                feedback: similarity.imageSimilarity.explanation || 'AI similarity analysis complete.'
              });
            }
          } catch (apiError) {
            // If OpenAI fails for a pair, skip it but continue
            console.error('OpenAI API error for post pair:', apiError);
          }
        }
        if (rateLimitError) break;
      }
      if (rateLimitError) {
        grid.innerHTML = `<div class="no-recommendations">${apiErrorMessage || 'You have hit the OpenAI API rate limit. Please wait a minute and try again.'}</div>`;
        section.style.display = 'block';
      } else {
        grid.innerHTML = openAICalled
          ? '<div class="success-recommendations">AI connection successful! Recommendations loaded below.</div>'
          : '<div class="no-recommendations">No AI recommendations found. Try creating or updating your posts for better matches!</div>';
      }
    } catch (apiError) {
      console.error('AI API error:', apiError);
      grid.innerHTML = '<div class="no-recommendations">Unable to connect to the AI recommendation service. Please try again later.</div>';
      return;
    }
    window.currentRecommendations = recommendations;
    // Append recommendations below the success message
    if (!rateLimitError) {
      grid.innerHTML += recommendations.length > 0
        ? recommendations.map(rec => createRecommendationCard(rec)).join('')
        : '<div class="no-recommendations">No AI recommendations found. Try creating or updating your posts for better matches!</div>';
    }
  } catch (error) {
    console.error('Error in AI recommendations:', error);
    grid.innerHTML = '<div class="no-recommendations">Error loading recommendations. Please check your internet connection or try again later.</div>';
  }
}

function renderRecommendations(recommendations, filter = 'all') {
  const grid = document.getElementById('recommendationsGrid');
  
  // Filter recommendations based on selected filter
  let filteredRecs = recommendations;
  if (filter !== 'all') {
    filteredRecs = recommendations.filter(rec => rec.matchCategory === filter);
  }
  
  if (filteredRecs.length === 0) {
    grid.innerHTML = `
      <div class="no-recommendations">
        <i class="fas fa-filter"></i>
        <h3>No matches in this category</h3>
        <p>Try selecting a different filter or check "All Recommendations".</p>
      </div>
    `;
    return;
  }
  
  grid.innerHTML = filteredRecs.map(rec => createRecommendationCard(rec)).join('');
}

function createRecommendationCard(recommendation) {
  const { userPost, matchedPost, totalScore, matchCategory, matchingFactors, confidence, feedback } = recommendation;
  const scorePercentage = Math.round(confidence);
  const scoreClass = matchCategory;
  return `
    <div class="recommendation-card" data-category="${matchCategory}">
      <div class="recommendation-header">
        <div class="match-score score-${scoreClass}">
          <i class="fas fa-star"></i>
          <span>${scorePercentage}% Match</span>
        </div>
        <div class="score-bar">
          <div class="score-fill ${scoreClass}" style="width: ${scorePercentage}%"></div>
        </div>
      </div>
      <div class="recommendation-content">
        <div class="post-preview">
          <div class="post-type ${userPost.type}">${userPost.type.toUpperCase()}</div>
          <div class="post-title">${escapeHtml(userPost.title)}</div>
          ${userPost.imageData ? `<img src="${userPost.imageData}" alt="${escapeHtml(userPost.title)}" class="post-image" onerror="this.onerror=null;this.src='default-image.png';" />` : ''}
        </div>
        <div class="post-preview">
          <div class="post-type ${matchedPost.type}">${matchedPost.type.toUpperCase()}</div>
          <div class="post-title">${escapeHtml(matchedPost.title)}</div>
          ${matchedPost.imageData ? `<img src="${matchedPost.imageData}" alt="${escapeHtml(matchedPost.title)}" class="post-image" onerror="this.onerror=null;this.src='default-image.png';" />` : ''}
        </div>
      </div>
      <div class="ai-feedback" style="margin:1rem 0 0.5rem 0; color:#4a4a4a; font-size:1.08rem; font-weight:500; background:#f6fafd; border-radius:8px; padding:0.7rem 1.2rem;">
        <i class="fas fa-info-circle" style="color:#3498db;"></i> ${escapeHtml(feedback)}
      </div>
      <div class="match-factors">
        <h4><i class="fas fa-link"></i> Matching Factors</h4>
        <div class="factor-list">
          ${matchingFactors.map(factor => `<span class="factor-tag">${escapeHtml(factor)}</span>`).join('')}
        </div>
      </div>
      <div class="recommendation-actions">
        <button class="rec-btn rec-btn-primary" onclick="viewRecommendedPost('${matchedPost.id}')">
          <i class="fas fa-eye"></i> View Details
        </button>
        <button class="rec-btn rec-btn-secondary" onclick="contactForRecommendation('${matchedPost.id}', '${userPost.id}')">
          <i class="fas fa-comment"></i> Contact
        </button>
      </div>
    </div>
  `;
}

function updateAIInsights(recommendations) {
  const insightsContent = document.getElementById('aiInsightsContent');
  
  const totalRecs = recommendations.length;
  const highMatches = recommendations.filter(r => r.matchCategory === 'high').length;
  const mediumMatches = recommendations.filter(r => r.matchCategory === 'medium').length;
  const visualMatches = recommendations.filter(r => r.matchCategory === 'visual').length;
  
  const avgConfidence = recommendations.reduce((sum, r) => sum + r.confidence, 0) / totalRecs;
  
  insightsContent.innerHTML = `
    <div style="margin-bottom: 1rem;">
      <p><strong>Analysis Summary:</strong></p>
      <p>Found ${totalRecs} potential matches with an average confidence of ${Math.round(avgConfidence)}%</p>
    </div>
    
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 1rem;">
      <div style="background: #e8f5e8; padding: 1rem; border-radius: 8px; text-align: center;">
        <div style="font-size: 1.5rem; font-weight: bold; color: #27ae60;">${highMatches}</div>
               <div style="color: #27ae60;">High Matches</div>
      </div>
      <div style="background: #fff3cd; padding: 1rem; border-radius: 8px; text-align: center;">
        <div style="font-size: 1.5rem; font-weight: bold; color: #f39c12;">${mediumMatches}</div>
        <div style="color: #f39c12;">Medium Matches</div>
      </div>
      <div style="background: #f3e5f5; padding: 1rem; border-radius: 8px; text-align: center;">
        <div style="font-size: 1.5rem; font-weight: bold; color: #9b59b6;">${visualMatches}</div>
        <div style="color: #9b59b6;">Visual Matches</div>
      </div>
    </div>
    
    <p>The AI analyzes multiple factors to find the best matches:</p>
    <ul>
      <li><i class="fas fa-tag"></i> Tag similarity and semantic meaning</li>
      <li><i class="fas fa-font"></i> Text description analysis</li>
      <li><i class="fas fa-image"></i> Visual characteristics comparison</li>
      <li><i class="fas fa-map-marker-alt"></i> Location proximity</li>
      <li><i class="fas fa-clock"></i> Temporal relevance</li>
    </ul>
  `;
}

// Update: Show a message if no AI recommendations are found
function renderAIRecommendations(recommendations) {
  const recommendationsGrid = document.getElementById('recommendationsGrid');
  recommendationsGrid.innerHTML = '';
  if (!recommendations || recommendations.length === 0) {
    recommendationsGrid.innerHTML = '<div class="no-recommendations">No AI recommendations found. Try creating or updating your posts for better matches!</div>';
    return;
  }

  recommendationsGrid.innerHTML = recommendations.map(rec => createRecommendationCard(rec)).join('');
}

// Global functions for recommendation interactions
window.viewRecommendedPost = (postId) => {
  window.location.href = `post-details.html?id=${encodeURIComponent(postId)}`;
};

window.contactForRecommendation = async (postId, userPostId) => {
  // Open claim modal for the recommended post
  window.openClaimModal(postId);
};

// Initialize event handlers for AI recommendations
document.addEventListener('DOMContentLoaded', () => {
  // AI Recommendations button
  const aiRecommendationsBtn = document.getElementById('aiRecommendationsBtn');
  if (aiRecommendationsBtn) {
    aiRecommendationsBtn.addEventListener('click', showAIRecommendations);
  }
  
 
  // Filter buttons
  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('filter-btn')) {
      // Update active filter
      document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
      e.target.classList.add('active');
      
      // Get current recommendations and re-render with filter
      const filter = e.target.dataset.filter;
      const currentRecs = window.currentRecommendations || [];
      renderRecommendations(currentRecs, filter);
    }
  });
});

// Store recommendations globally for filtering// Store recommendations globally for filtering
window.currentRecommendations = [];

// Add unclaimPost function globally// Add unclaimPost function globally
window.unclaimPost = async function(postId) {
  if (!currentUser) return;
  try {
    const postRef = ref(db, 'posts/' + postId);
    await update(postRef, {
      claimed: false,
      claimedBy: null
    });
    // Reload posts to reflect change
    window.location.reload();
  } catch (error) {
    alert('Failed to unclaim the post.');
  }
};

// Helper: Upload image file to imgbb and return the image URL// Helper: Upload image file to imgbb and return the image URL
async function uploadImageToImgbb(file) {
  const apiKey = '7f5b86f1efb5c249bafe472c9078a76d'; // Your imgbb API key
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

// Remove duplicate import of 'update' if present
// import { update } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-database.js";
// Only import once at the top of the file if needed

// Fix the AI recommendations button handler
document.addEventListener('DOMContentLoaded', () => {
  const aiRecommendationsBtn = document.getElementById('aiRecommendationsBtn');
  if (aiRecommendationsBtn) {
    aiRecommendationsBtn.addEventListener('click', showAIRecommendations);
  }
});

// Add missing escapeHtml function if not defined
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Fix error with recommendation filters
const recommendationFilters = document.querySelector('.recommendation-filters');
if (recommendationFilters) {
  recommendationFilters.addEventListener('click', (e) => {
    if (!e.target.classList.contains('filter-btn')) return;

    // Update active button
    document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
    e.target.classList.add('active');

    // Filter recommendations
    const filter = e.target.dataset.filter;
    const cards = document.querySelectorAll('.recommendation-card');

    cards.forEach(card => {
      const scoreEl = card.querySelector('.match-score');
      if (!scoreEl) return;
      
      const score = parseFloat(scoreEl.textContent);
      switch (filter) {
        case 'high':
          card.style.display = score >= 80 ? 'block' : 'none';
          break;
        case 'medium':
          card.style.display = score >= 75 && score < 80 ? 'block' : 'none';
          break;
        case 'visual':
          card.style.display = card.querySelector('.factor-tag[data-type="visual"]') ? 'block' : 'none';
          break;
        default:
          card.style.display = 'block';
      }
    });
  });
}

// Add missing notification handling setup
function setupNotificationClickHandler() {
  document.querySelectorAll('.notification-item').forEach(item => {
    item.addEventListener('click', async function() {
      const notificationId = this.dataset.id;
      const notificationsRef = ref(db, 'notifications');
      const snapshot = await get(notificationsRef);
      const data = snapshot.val();
      
      if (data && data[notificationId]) {
        // Mark as read
        await update(ref(db, `notifications/${notificationId}`), {
          read: true
        });
        
        // Show notification detail
        await showNotificationDetail({
          id: notificationId,
          ...data[notificationId]
        });
      }
    });
  });
}

// --- AI API Usage Limiting ---
const AI_USER_LIMIT_PER_HOUR = 5; // Max 5 AI calls per user per hour
const AI_GLOBAL_DAILY_LIMIT = 100; // Max 100 AI calls globally per day (adjust as needed)

function getUserAIUsage() {
  const usage = JSON.parse(localStorage.getItem('ai_usage') || '{}');
  const now = Date.now();
  // Remove entries older than 1 hour
  Object.keys(usage).forEach(ts => {
    if (now - Number(ts) > 60 * 60 * 1000) delete usage[ts];
  });
  return usage;
}

function incrementUserAIUsage() {
  const usage = getUserAIUsage();
  usage[Date.now()] = 1;
  localStorage.setItem('ai_usage', JSON.stringify(usage));
}

function userAIUsageCount() {
  return Object.keys(getUserAIUsage()).length;
}

async function getGlobalAIUsage() {
  // Store global usage in Firebase at /ai_usage/yyyy-mm-dd
  const today = new Date().toISOString().slice(0, 10);
  const usageRef = ref(db, `ai_usage/${today}`);
  const snap = await get(usageRef);
  return snap.exists() ? snap.val() : 0;
}

async function incrementGlobalAIUsage() {
  const today = new Date().toISOString().slice(0, 10);
  const usageRef = ref(db, `ai_usage/${today}`);
  const snap = await get(usageRef);
  const current = snap.exists() ? snap.val() : 0;
  await set(usageRef, current + 1);
}