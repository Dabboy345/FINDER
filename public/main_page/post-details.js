import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { getDatabase, ref, get, update, set, push, onValue } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-database.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyBmS-i8N6sFOB4khvIpX-_fFN3ITebSS0g",
  authDomain: "finder-ff519.firebaseapp.com",
  databaseURL: "https://finder-ff519-default-rtdb.europe-west1.firebasedatabase.app/",
  projectId: "finder-ff519",
  storageBucket: "finder-ff519.appspot.com",
  messagingSenderId: "989218762868",
  appId: "1:989218762868:web:7f5160caf34ddccd92e121"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

let currentUser = null;
let postId = null;
let matchedWithId = null;

// Claim functionality variables
let currentClaimPostId = null;
let currentClaimPost = null;

// Chat functionality variables
let currentChatId = null;
let currentChatPartner = null;
let currentChatPost = null;

// Enhanced notification functionality
let unreadNotifications = 0;

function escapeHtml(text) {
  if (!text) return "";
  return text.replace(/[&<>"']/g, m => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[m]);
}

function getQueryParam(name) {
  const url = new URL(window.location.href);
  return url.searchParams.get(name);
}

async function getPostById(id) {
  const postRef = ref(db, `posts/${id}`);
  const snapshot = await get(postRef);
  return snapshot.exists() ? snapshot.val() : null;
}

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

// Function to open claim modal
window.openClaimModal = async function(postId) {
  if (!currentUser) {
    alert("Please log in to claim an item.");
    return;
  }

  currentClaimPostId = postId;
  currentClaimPost = await getPostById(postId);

  if (!currentClaimPost) {
    alert("Post not found.");
    return;
  }

  if (currentClaimPost.claimed) {
    alert("This item has already been claimed.");
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

function renderPostDetails(post, isOwner, postId, matchedWithPost = null) {
  const container = document.getElementById('postDetailsContainer');
  
  // If matchedWithPost is present, show both posts side by side
  if (matchedWithPost) {
    container.innerHTML = `
      <div class="matched-posts-container">
        <div class="matched-post-card">
          <h3><i class="fas fa-user-circle"></i> Your Post</h3>
          <div class="matched-post-title">${escapeHtml(matchedWithPost.title)}</div>
          ${matchedWithPost.imageData ? `
            <img src="${matchedWithPost.imageData}" alt="Your Post" class="matched-post-image" onerror="this.onerror=null;this.src='default-image.png';" />
          ` : ''}
          <div class="matched-post-description">${escapeHtml(matchedWithPost.description || '')}</div>
          ${(matchedWithPost.labels?.length) ? `
            <div class="matched-post-labels">
              ${matchedWithPost.labels.map(l => `<span class="label">${escapeHtml(l)}</span>`).join('')}
            </div>
          ` : ''}
        </div>
        
        <div class="match-arrow">
          <i class="fas fa-heart"></i>
        </div>
        
        <div class="matched-post-card">
          <h3><i class="fas fa-search"></i> Matched Post</h3>
          <div class="matched-post-title">${escapeHtml(post.title)}</div>
          ${post.imageData ? `
            <img src="${post.imageData}" alt="Matched Post" class="matched-post-image" onerror="this.onerror=null;this.src='default-image.png';" />
          ` : ''}
          <div class="matched-post-description">${escapeHtml(post.description || '')}</div>
          ${(post.labels?.length) ? `
            <div class="matched-post-labels">
              ${post.labels.map(l => `<span class="label">${escapeHtml(l)}</span>`).join('')}
            </div>
          ` : ''}
        </div>
      </div>
      
      <div class="post-details-card" style="margin-top: 2rem;">
        <h2><i class="fas fa-handshake"></i> Match</h2>
        <div class="post-meta">
          <div class="meta-item">
            <i class="fas fa-envelope"></i>
            <div class="meta-content">
              <span class="meta-label">Contact</span>
              <span class="meta-value">${escapeHtml(post.user?.email || "Unknown")}</span>
            </div>
          </div>
          <div class="meta-item">
            <i class="fas fa-calendar-alt"></i>
            <div class="meta-content">
              <span class="meta-label">Match found</span>
              <span class="meta-value">${formatDate(Date.now())}</span>
            </div>
          </div>
        </div>
      </div>
    `;
    return;
  }

  // Single post view with enhanced styling
  let html = `
    <div class="post-details-card">
      <h2>${escapeHtml(post.title)}</h2>
      
      ${post.imageData ? `
        <img src="${post.imageData}" alt="${escapeHtml(post.title)}" class="post-image" onerror="this.onerror=null;this.src='default-image.png';" />
      ` : ''}
      
      <div class="post-description">${escapeHtml(post.description || '')}</div>
      
      ${post.labels?.length ? `
        <div class="labels">
          ${post.labels.map(label => `<span class="label"><i class="fas fa-tag"></i> ${escapeHtml(label)}</span>`).join('')}
        </div>
      ` : ''}
      
      <div class="post-meta">
        <div class="meta-item">
          <i class="fas fa-user-circle"></i>
          <div class="meta-content">
            <span class="meta-label">Posted by</span>
            <span class="meta-value">${escapeHtml(post.user?.email || "Unknown")}</span>
          </div>
        </div>
        <div class="meta-item">
          <i class="fas fa-calendar-alt"></i>
          <div class="meta-content">
            <span class="meta-label">Created</span>
            <span class="meta-value">${formatDate(post.timestamp)}</span>
          </div>
        </div>
        ${post.lastEdited ? `
          <div class="meta-item">
            <i class="fas fa-edit"></i>
            <div class="meta-content">
              <span class="meta-label">Last edited</span>
              <span class="meta-value">${formatDate(post.lastEdited)}</span>
            </div>
          </div>
        ` : ''}
      </div>
      
      <div class="post-actions">
        ${post.claimed ? `
          <div class="claim-status claimed">
            <i class="fas fa-check-circle"></i>
            <div>
              <strong>Successfully Claimed!</strong><br>
              <small>Claimed by ${escapeHtml(post.claimedBy?.email || "Unknown")}</small>
            </div>
            ${(isOwner || (currentUser && post.claimedBy && currentUser.uid === post.claimedBy.uid)) ? `
              <button class="chat-btn" onclick="openChat('${postId}', '${isOwner ? post.claimedBy.uid : post.user.uid}', '${isOwner ? post.claimedBy.email : post.user.email}')">
                <i class="fas fa-comments"></i>
                Chat with ${isOwner ? 'the claimer' : 'the owner'}
              </button>
            ` : ''}
          </div>
        ` : isOwner ? `
          <div class="claim-status owner-message">
            <i class="fas fa-info-circle"></i>
            <div>
              <strong>Your Post</strong><br>
              <small>Waiting for someone to claim it</small>
            </div>
          </div>
        ` : `
          <button class="btn claim-btn" id="claimBtn">
            <i class="fas fa-hand-holding"></i> 
            <span>Claim This Item</span>
          </button>
        `}
        
        ${isOwner ? `
          <button class="btn" id="editBtn" style="background: linear-gradient(135deg, #f39c12 0%, #e67e22 100%); box-shadow: 0 6px 20px rgba(243, 156, 18, 0.3);">
            <i class="fas fa-edit"></i> 
            <span>Edit Post</span>
          </button>
          <button class="btn" id="deleteBtn" style="background: linear-gradient(135deg, #e74c3c 0%, #c0392b 100%); box-shadow: 0 6px 20px rgba(231, 76, 60, 0.3);">
            <i class="fas fa-trash"></i> 
            <span>Delete Post</span>
          </button>
        ` : ''}
      </div>
    </div>
  `;

  container.innerHTML = html;

  // Add enhanced button handlers
  if (!post.claimed && !isOwner && document.getElementById('claimBtn')) {
    document.getElementById('claimBtn').onclick = async () => {
      await openClaimModal(postId);
    };
  }
  
  if (isOwner && document.getElementById('editBtn')) {
    document.getElementById('editBtn').onclick = async () => {
      const editBtn = document.getElementById('editBtn');
      editBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> <span>Loading...</span>';
      editBtn.disabled = true;
      
      setTimeout(() => {
        alert('✏️ Edit functionality will be implemented soon!');
        editBtn.innerHTML = '<i class="fas fa-edit"></i> <span>Edit Post</span>';
        editBtn.disabled = false;
      }, 1000);
    };
  }
  
  if (isOwner && document.getElementById('deleteBtn')) {
    document.getElementById('deleteBtn').onclick = async () => {
      const result = confirm("⚠️ Are you sure you want to delete this post? This action cannot be undone.");
      if (result) {
        const deleteBtn = document.getElementById('deleteBtn');
        deleteBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> <span>Deleting...</span>';
        deleteBtn.disabled = true;
        
        try {
          await set(ref(db, `posts/${postId}`), null);
          alert("🗑️ Post deleted successfully!");
          window.location.href = "main_page.html";
        } catch (error) {
          console.error("Error deleting post:", error);
          alert("❌ Error deleting post. Please try again.");
          deleteBtn.innerHTML = '<i class="fas fa-trash"></i> <span>Delete Post</span>';
          deleteBtn.disabled = false;
        }
      }
    };
  }
}

// Chat functionality
function generateChatId(user1Id, user2Id, postId) {
  const sortedIds = [user1Id, user2Id].sort();
  return `${sortedIds[0]}_${sortedIds[1]}_${postId}`;
}

async function openChat(postId, otherUserId, otherUserEmail) {
  if (!currentUser) {
    alert("Please log in to use the chat.");
    return;
  }

  const post = await getPostById(postId);
  if (!post) return;

  currentChatId = generateChatId(currentUser.uid, otherUserId, postId);
  currentChatPartner = { uid: otherUserId, email: otherUserEmail };
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

async function loadMessages() {
  if (!currentChatId) return;

  const messagesRef = ref(db, `chats/${currentChatId}/messages`);
  const snapshot = await get(messagesRef);
  const messages = snapshot.val() || {};
  
  displayMessages(Object.entries(messages));
}

function listenToNewMessages() {
  if (!currentChatId) return;

  const messagesRef = ref(db, `chats/${currentChatId}/messages`);
  onValue(messagesRef, (snapshot) => {
    const messages = snapshot.val() || {};
    displayMessages(Object.entries(messages));
  });
}

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

function formatMessage(message) {
  if (!message) return '';
  return escapeHtml(message).replace(/\n/g, '<br>');
}

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

  // Ensure notification is always sent
  let chatPost = currentChatPost;
  if (!chatPost || !chatPost.id) {
    // Fallback: try to extract postId from chatId
    const parts = currentChatId.split('_');
    const postId = parts[2];
    chatPost = await getPostById(postId);
    chatPost = { ...chatPost, id: postId };
  }

  if (currentChatPartner && chatPost && chatPost.id) {
    await createNotification(
      currentChatPartner.uid,
      'New Message',
      `${currentUser.email} sent you a message about: ${chatPost.title}`,
      'chat',
      chatPost.id,
      {
        chatId: currentChatId,
        message: text.trim()
      }
    );
  }
  
  // Reload the page after sending message
  window.location.reload();
}

// Make openChat function globally available
window.openChat = openChat;

// Notification management functions
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
  
  const notificationDropdown = document.querySelector('.notification-dropdown');
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
          <i class="fas ${getNotificationIcon(notification.type)}"></i>
          ${escapeHtml(notification.title)}
        </div>
        <div class="notification-message">${escapeHtml(notification.message)}</div>
        <div class="notification-time">${timeString}</div>
      </div>
    `;
  }).join('');

  // Setup click handlers for notifications
  setupNotificationClickHandler();
}

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

// Helper functions
function getNotificationIcon(type) {
  const icons = {
    'claim': 'fa-hand-holding',
    'chat': 'fa-comments',
    'match': 'fa-link',
    'tag': 'fa-tag'
  };
  return icons[type] || 'fa-bell';
}

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

function replyToLatestClaim(notificationId) {
  alert('Reply functionality will be implemented in a future update.');
}

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

function formatMessage(message) {
  if (!message) return '';
  return escapeHtml(message).replace(/\n/g, '<br>');
}

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

// Initialize notification dropdown functionality
document.addEventListener('DOMContentLoaded', () => {
  const notificationContainer = document.querySelector('.notification-container');
  const notificationDropdown = notificationContainer.querySelector('.notification-dropdown');
  
  // Notification container click handler
  notificationContainer.addEventListener('click', (e) => {
    if (e.target.closest('.notification-dropdown')) return;
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

  // Initialize notification modal handlers
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

onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  postId = getQueryParam('id');
  matchedWithId = getQueryParam('matchedWith');
  if (!postId) {
    document.getElementById('postDetailsContainer').innerHTML = "<p>Post not found.</p>";
    return;
  }
  const post = await getPostById(postId);
  if (!post) {
    document.getElementById('postDetailsContainer').innerHTML = "<p>Post not found.</p>";
    return;
  }
  let matchedWithPost = null;
  if (matchedWithId) {
    matchedWithPost = await getPostById(matchedWithId);
  }
  renderPostDetails(post, currentUser && post.user && post.user.uid === currentUser.uid, postId, matchedWithPost);
});

// Modal event handlers
document.getElementById('closeClaimModal').onclick =
document.getElementById('cancelClaimBtn').onclick = function() {
  document.getElementById('claimModal').style.display = 'none';
};

// Send claim message handler
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