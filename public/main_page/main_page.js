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
        // Only notify for the first match per post
        break;
      }
    }
    if (foundMatch && matchInfo) {
      showMatchModal(matchInfo.myPost, matchInfo.otherPost, matchInfo.shared);
      alert("Match found! Check notifications for details.");
      break;
    }
  }
  if (!foundMatch) {
    alert("No matches found based on labels.");
  }
});

// Update notification click handler to redirect to post-details for match notifications
function setupNotificationClickHandler() {
  notificationDropdown.querySelectorAll('.notification-item').forEach(item => {
    item.addEventListener('click', async () => {
      const notificationId = item.dataset.id;
      const notificationRef = ref(db, `notifications/${notificationId}`);
      await update(notificationRef, { read: true });
      item.classList.remove('unread');
      unreadNotifications--;
      updateNotificationBadge(unreadNotifications);

      // Fetch notification data
      const snapshot = await get(notificationRef);
      const notification = snapshot.val();
      if (!notification) return;

      // Redirect for match notifications
      if (notification.type === 'match' && notification.postId && notification.matchedWithId) {
        window.location.href = `post-details.html?id=${encodeURIComponent(notification.postId)}&matchedWith=${encodeURIComponent(notification.matchedWithId)}`;
      } else if (notification.postId) {
        window.location.href = `post-details.html?id=${encodeURIComponent(notification.postId)}`;
      } else {
        await showNotificationDetail({ ...notification, id: notificationId });
      }
    });
  });
}

// Call this after loading notifications
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

document.addEventListener('click', async (e) => {
  if (e.target.classList.contains('notification-item')) {
    const notificationId = e.target.dataset.id;
    const notificationRef = ref(db, `notifications/${notificationId}`);
    await update(notificationRef, { read: true });
    e.target.classList.remove('unread');
    unreadNotifications--;
    updateNotificationBadge(unreadNotifications);

    // Redirect or show details based on notification type
    const notificationSnapshot = await get(notificationRef);
    if (notificationSnapshot.exists()) {
      const notification = notificationSnapshot.val();
      if (notification.type === 'match' && notification.postId && notification.matchedWithId) {
        window.location.href = `post-details.html?id=${encodeURIComponent(notification.postId)}&matchedWith=${encodeURIComponent(notification.matchedWithId)}`;
      } else if (notification.postId) {
        window.location.href = `post-details.html?id=${encodeURIComponent(notification.postId)}`;
      } else {
        await showNotificationDetail({ ...notification, id: notificationId });
      }
    }
  }
});