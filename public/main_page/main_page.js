import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { getDatabase, ref, onValue, update, push, get, set } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-database.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";
import { getStorage, ref as storageRef, deleteObject } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-storage.js";

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
const storage = getStorage(app);

const postsContainer = document.querySelector(".posts-container");
let currentUser = null;

// Listen for auth state changes
onAuthStateChanged(auth, (user) => {
  currentUser = user;
});

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

const postsMap = {};
const postsRef = ref(db, "posts");
onValue(postsRef, async (snapshot) => {
  const data = snapshot.val();
  if (!data) {
    postsContainer.innerHTML = "<p>No posts found.</p>";
    return;
  }

  // Convert data to array of [postId, post] pairs
  const posts = Object.entries(data)
    .filter(([postId, post]) => post && typeof post === "object")
    .sort(([, a], [, b]) => (b.timestamp || 0) - (a.timestamp || 0));

  // Store posts in postsMap
  Object.keys(postsMap).forEach(key => delete postsMap[key]);
  for (const [postId, post] of posts) {
    postsMap[postId] = post;
  }

  // Get all claims for the current user
  let userClaims = {};
  if (currentUser) {
    try {
      const claimsRef = ref(db, 'claims');
      const claimsSnapshot = await get(claimsRef);
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
      userClaims = {};
    }
  }

  // Render posts
  postsContainer.innerHTML = posts.map(([postId, post]) => `
    <div class="post ${post.claimed ? 'claimed' : ''} ${currentUser && post.user && currentUser.uid === post.user.uid ? 'own-post' : ''}" 
         data-post-id="${postId}" style="cursor:pointer;">
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
          ${currentUser && (currentUser.uid === post.user.uid || currentUser.uid === post.claimedBy?.uid) ? `
            <button class="chat-btn" onclick="event.stopPropagation();openChat('${postId}', '${
              currentUser.uid === post.user.uid ? post.claimedBy.uid : post.user.uid
            }', '${
              currentUser.uid === post.user.uid ? post.claimedBy.email : post.user.email
            }')">
              <i class="fas fa-comments"></i>
              Chat
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
        </div>
      ` : `
        <button class="claim-btn" onclick="event.stopPropagation();openClaimModal('${postId}')">
          <i class="fas fa-hand-holding"></i>
          Claim Item
        </button>
      `}
    </div>
  `).join("");

  // Add click event to all posts for redirection
  document.querySelectorAll('.post[data-post-id]').forEach(postDiv => {
    postDiv.addEventListener('click', function() {
      const postId = this.getAttribute('data-post-id');
      window.location.href = `post-details.html?id=${encodeURIComponent(postId)}`;
    });
  });

  // Trigger auto-suggestions after posts are loaded (if user is logged in)
  if (currentUser) {
    // Get user's posts
    const myPosts = Object.entries(data)
      .filter(([, post]) => post.user?.uid === currentUser.uid)
      .map(([id, post]) => ({ id, ...post }));
    
    // Check for auto-suggestions after a short delay to let user browse
    if (myPosts.length > 0) {
      setTimeout(() => {
        checkForMatchSuggestions(myPosts, data);
      }, 5000); // Show suggestions after 5 seconds of browsing
    }
  }
}, (error) => {
  console.error("Error loading posts:", error);
  postsContainer.innerHTML = "<p>Error loading posts.</p>";
});

function escapeHtml(text) {
  if (!text) return "";
  return text.replace(/[&<>"']/g, m => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[m]);
}

// Make handleClaim available globally
window.handleClaim = handleClaim;

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

// Update notification detail modal to the DOM
const notificationDetailModal = document.createElement('div');
notificationDetailModal.id = 'notificationDetailModal';
notificationDetailModal.className = 'modal';
notificationDetailModal.style.display = 'none';
notificationDetailModal.innerHTML = `
  <div class="modal-content" id="notificationDetailContent">
    <div class="modal-header">
      <span class="close" id="closeNotificationDetail">&times;</span>
      <button class="delete-notification-btn" id="deleteNotificationBtn">
        <i class="fas fa-trash"></i> Delete
      </button>
    </div>
    <div id="notificationDetailBody"></div>
  </div>
`;
document.body.appendChild(notificationDetailModal);

document.getElementById('closeNotificationDetail').onclick = function() {
  notificationDetailModal.style.display = 'none';
};

// Add delete notification functionality
document.getElementById('deleteNotificationBtn').onclick = async function() {
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
                ${matchedWithPost.labels.map(l => `<span class="label">${escapeHtml(l)}</span>`).join(' ')}
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
                ${post.labels.map(l => `<span class="label">${escapeHtml(l)}</span>`).join(' ')}
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
  notificationDetailModal.style.display = 'flex';
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

  const closeModal = () => {
    editModal.remove();
  };

  closeBtn.onclick = closeModal;
  cancelBtn.onclick = closeModal;

  form.onsubmit = async (e) => {
    e.preventDefault();
    
    const updatedPost = {
      ...post,
      title: form.editTitle.value.trim(),
      description: form.editDescription.value.trim(),
      labels: form.editLabels.value.split(',').map(label => label.trim()).filter(Boolean),
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
  if (!currentUser || !post.user || post.user.uid !== currentUser.uid) {
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
  currentChatPost = post;

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

  // Send notification to chat partner
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

// Chat modal event listeners
document.getElementById('closeChatModal').onclick = function() {
  document.getElementById('chatModal').style.display = 'none';
  currentChatId = null;
  currentChatPartner = null;
  currentChatPost = null;
};

document.getElementById('sendChatMessage').onclick = async function() {
  const input = document.getElementById('chatMessageInput');
  const message = input.value.trim();
  
  if (message) {
    await sendMessage(message);
    input.value = '';
  }
};

document.getElementById('chatMessageInput').addEventListener('keypress', async function(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    const message = this.value.trim();
    
    if (message) {
      await sendMessage(message);
      this.value = '';
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
async function enhancedFindMatches() {
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
}

// AI-Powered Recommendation System
class AIRecommendationEngine {
  constructor() {
    this.weightings = {
      exactMatch: 10,
      semanticSimilarity: 8,
      visualSimilarity: 6,
      locationProximity: 4,
      temporalRelevance: 3,
      userBehavior: 2
    };
    
    // Common synonyms and related terms for better matching
    this.semanticGroups = {
      electronics: ['phone', 'mobile', 'smartphone', 'iphone', 'android', 'tablet', 'laptop', 'computer', 'headphones', 'earbuds', 'charger', 'cable'],
      accessories: ['watch', 'ring', 'necklace', 'bracelet', 'earrings', 'jewelry', 'glasses', 'sunglasses'],
      clothing: ['shirt', 'jacket', 'coat', 'pants', 'jeans', 'dress', 'skirt', 'shoes', 'sneakers', 'boots', 'hat', 'cap'],
      bags: ['backpack', 'purse', 'wallet', 'bag', 'briefcase', 'handbag', 'suitcase', 'luggage'],
      keys: ['keys', 'keychain', 'car keys', 'house keys', 'remote'],
      documents: ['id', 'passport', 'license', 'card', 'document', 'paper', 'certificate'],
      pets: ['dog', 'cat', 'pet', 'animal', 'puppy', 'kitten'],
      sports: ['ball', 'basketball', 'football', 'soccer', 'tennis', 'golf', 'equipment']
    };
  }

  // Calculate semantic similarity between two texts
  calculateSemanticSimilarity(text1, text2) {
    const words1 = this.extractKeywords(text1.toLowerCase());
    const words2 = this.extractKeywords(text2.toLowerCase());
    
    let matches = 0;
    let semanticMatches = 0;
    
    // Exact word matches
    words1.forEach(word1 => {
      if (words2.includes(word1)) {
        matches++;
      } else {
        // Check semantic groups
        for (const group of Object.values(this.semanticGroups)) {
          if (group.includes(word1)) {
            words2.forEach(word2 => {
              if (group.includes(word2) && word1 !== word2) {
                semanticMatches += 0.7; // Partial match for related terms
              }
            });
          }
        }
      }
    });
    
    const totalWords = Math.max(words1.length, words2.length);
    return totalWords > 0 ? (matches + semanticMatches) / totalWords : 0;
  }

  // Extract meaningful keywords from text
  extractKeywords(text) {
    const stopWords = ['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'was', 'are', 'were', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'my', 'your', 'his', 'her', 'its', 'our', 'their'];
    return text.split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.includes(word))
      .map(word => word.replace(/[^\w]/g, ''));
  }

  // Calculate visual similarity based on image characteristics
  calculateVisualSimilarity(post1, post2) {
    // This is a simplified version - in a real implementation, 
    // you'd use computer vision APIs or ML models
    let similarity = 0;
    
    // Both have images
    if (post1.imageData && post2.imageData) {
      similarity += 0.3;
      
      // Check if both images are present (basic check)
      if (post1.imageData.length > 1000 && post2.imageData.length > 1000) {
        similarity += 0.2;
      }
    }
    
    // Color analysis (simplified - checking for common color terms)
    const colorTerms = ['red', 'blue', 'green', 'yellow', 'black', 'white', 'brown', 'gray', 'silver', 'gold'];
    const post1Colors = colorTerms.filter(color => 
      (post1.title + ' ' + (post1.description || '')).toLowerCase().includes(color)
    );
    const post2Colors = colorTerms.filter(color => 
      (post2.title + ' ' + (post2.description || '')).toLowerCase().includes(color)
    );
    
    const commonColors = post1Colors.filter(color => post2Colors.includes(color));
    similarity += commonColors.length * 0.1;
    
    return Math.min(similarity, 1);
  }

  // Calculate location proximity (simplified)
  calculateLocationProximity(post1, post2) {
    // In a real implementation, you'd use actual GPS coordinates
    // For now, we'll use a simplified approach based on location text
    if (post1.location && post2.location) {
      const loc1 = post1.location.toLowerCase();
      const loc2 = post2.location.toLowerCase();
      
      if (loc1 === loc2) return 1;
      
      // Check for common area terms
      const areas1 = loc1.split(/[,\s]+/);
      const areas2 = loc2.split(/[,\s]+/);
      const commonAreas = areas1.filter(area => areas2.includes(area));
      
      return commonAreas.length > 0 ? 0.6 : 0.2;
    }
    return 0.5; // Default score when location is unknown
  }

  // Calculate temporal relevance
  calculateTemporalRelevance(post1, post2) {
    const now = Date.now();
    const time1 = post1.timestamp || now;
    const time2 = post2.timestamp || now;
    
    const timeDiff = Math.abs(time1 - time2);
    const daysDiff = timeDiff / (1000 * 60 * 60 * 24);
    
    // Items lost/found closer in time are more likely to be related
    if (daysDiff <= 1) return 1;
    if (daysDiff <= 7) return 0.8;
    if (daysDiff <= 30) return 0.5;
    return 0.2;
  }

  // Generate AI recommendations
  async generateRecommendations(userPosts, allPosts) {
    const recommendations = [];
    
    const otherPosts = Object.entries(allPosts)
      .filter(([, post]) => post.user?.uid !== currentUser.uid && !post.claimed)
      .map(([id, post]) => ({ id, ...post }));

    for (const userPost of userPosts) {
      const userType = userPost.type?.toLowerCase();
      if (userType !== "lost" && userType !== "found") continue;

      for (const otherPost of otherPosts) {
        const otherType = otherPost.type?.toLowerCase();
        if (!otherType || userType === otherType) continue;

        const recommendation = this.calculateRecommendationScore(userPost, otherPost);
        
        if (recommendation.totalScore > 0.3) { // Threshold for showing recommendations
          recommendations.push({
            userPost,
            matchedPost: otherPost,
            ...recommendation
          });
        }
      }
    }

    // Sort by total score and return top recommendations
    return recommendations
      .sort((a, b) => b.totalScore - a.totalScore)
      .slice(0, 20); // Limit to top 20 recommendations
  }

  // Calculate comprehensive recommendation score
  calculateRecommendationScore(userPost, otherPost) {
    const scores = {};
    
    // Combine title, description, and labels for text analysis
    const userText = [userPost.title, userPost.description, ...(userPost.labels || [])].join(' ');
    const otherText = [otherPost.title, otherPost.description, ...(otherPost.labels || [])].join(' ');
    
    // Calculate individual scores
    scores.semantic = this.calculateSemanticSimilarity(userText, otherText);
    scores.visual = this.calculateVisualSimilarity(userPost, otherPost);
    scores.location = this.calculateLocationProximity(userPost, otherPost);
    scores.temporal = this.calculateTemporalRelevance(userPost, otherPost);
    
    // Label exact matches (existing logic)
    const userLabels = (userPost.labels || []).map(l => l.toLowerCase());
    const otherLabels = (otherPost.labels || []).map(l => l.toLowerCase());
    const sharedLabels = userLabels.filter(l => l !== "lost" && l !== "found" && otherLabels.includes(l));
    scores.exactMatch = sharedLabels.length > 0 ? 1 : 0;
    
    // Calculate weighted total score
    const totalScore = (
      scores.exactMatch * this.weightings.exactMatch +
      scores.semantic * this.weightings.semanticSimilarity +
      scores.visual * this.weightings.visualSimilarity +
      scores.location * this.weightings.locationProximity +
      scores.temporal * this.weightings.temporalRelevance
    ) / Object.values(this.weightings).reduce((a, b) => a + b, 0);

    // Determine match category
    let matchCategory = 'low';
    if (scores.exactMatch > 0 || scores.semantic > 0.7) matchCategory = 'high';
    else if (scores.semantic > 0.4 || scores.visual > 0.6) matchCategory = 'medium';
    else if (scores.visual > 0.4) matchCategory = 'visual';

    // Identify matching factors
    const matchingFactors = [];
    if (sharedLabels.length > 0) matchingFactors.push(...sharedLabels);
    if (scores.semantic > 0.3) matchingFactors.push('Similar Description');
    if (scores.visual > 0.4) matchingFactors.push('Visual Similarity');
    if (scores.location > 0.6) matchingFactors.push('Same Area');
    if (scores.temporal > 0.8) matchingFactors.push('Recent Timeline');

    return {
      totalScore,
      scores,
      matchCategory,
      sharedLabels,
      matchingFactors,
      confidence: Math.min(totalScore * 100, 95) // Convert to percentage, cap at 95%
    };
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
  
  // Show section and loading state
  section.style.display = 'block';
  grid.innerHTML = `
    <div class="loading-recommendations">
      <div class="loading-spinner"></div>
      <p>AI is analyzing posts and generating recommendations...</p>
    </div>
  `;

  try {
    // Get all posts
    const postsSnapshot = await get(ref(db, 'posts'));
    const postsData = postsSnapshot.val();
    
    if (!postsData) {
      grid.innerHTML = `
        <div class="no-recommendations">
          <i class="fas fa-search"></i>
          <h3>No posts available</h3>
          <p>There are no posts to analyze for recommendations.</p>
        </div>
      `;
      return;
    }

    // Get user's posts
    const userPosts = Object.entries(postsData)
      .filter(([, post]) => post.user?.uid === currentUser.uid)
      .map(([id, post]) => ({ id, ...post }));

    if (userPosts.length === 0) {
      grid.innerHTML = `
        <div class="no-recommendations">
          <i class="fas fa-plus-circle"></i>
          <h3>Create a post first</h3>
          <p>You need to create a post before we can generate AI recommendations.</p>
          <button onclick="window.location.href='post-creation.html'" class="btn" style="margin-top: 1rem;">
            <i class="fas fa-plus"></i> Create Post
          </button>
        </div>
      `;
      return;
    }

    // Generate AI recommendations
    const recommendations = await aiEngine.generateRecommendations(userPosts, postsData);
    
    if (recommendations.length === 0) {
      grid.innerHTML = `
        <div class="no-recommendations">
          <i class="fas fa-robot"></i>
          <h3>No matches found</h3>
          <p>AI couldn't find any potential matches at the moment. Check back later as new posts are added!</p>
        </div>
      `;
      return;
    }

    // Render recommendations
    renderRecommendations(recommendations);
    
    // Update AI insights
    updateAIInsights(recommendations);
    
  } catch (error) {
    console.error('Error generating AI recommendations:', error);
    grid.innerHTML = `
      <div class="no-recommendations">
        <i class="fas fa-exclamation-triangle"></i>
        <h3>Error generating recommendations</h3>
        <p>Something went wrong. Please try again later.</p>
      </div>
    `;
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
  const { userPost, matchedPost, totalScore, matchCategory, matchingFactors, confidence } = recommendation;
  
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
          ${userPost.imageData ? 
            `<img src="${userPost.imageData}" alt="${escapeHtml(userPost.title)}" class="post-image" 
                  onerror="this.onerror=null;this.src='default-image.png';" />` : 
            ''
          }
        </div>
        
        <div class="post-preview">
          <div class="post-type ${matchedPost.type}">${matchedPost.type.toUpperCase()}</div>
          <div class="post-title">${escapeHtml(matchedPost.title)}</div>
          ${matchedPost.imageData ? 
            `<img src="${matchedPost.imageData}" alt="${escapeHtml(matchedPost.title)}" class="post-image" 
                  onerror="this.onerror=null;this.src='default-image.png';" />` : 
            ''
          }
        </div>
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
  const aiBtn = document.getElementById('aiRecommendationsBtn');
  if (aiBtn) {
    aiBtn.addEventListener('click', showAIRecommendations);
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

// Store recommendations globally for filtering
window.currentRecommendations = [];