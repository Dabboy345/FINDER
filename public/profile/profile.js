import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";
import { getDatabase, ref, onValue, query, orderByChild, equalTo, update, push, get, set } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-database.js";

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
let userPosts = [];

// Chat functionality
let currentChatId = null;
let currentOtherUserId = null;
let currentOtherUserEmail = null;

function generateChatId(user1Id, user2Id, postId) {
  return [user1Id, user2Id, postId].sort().join('_');
}

async function openChat(postId, otherUserId, otherUserEmail) {
  if (!currentUser) return;

  currentChatId = generateChatId(currentUser.uid, otherUserId, postId);
  currentOtherUserId = otherUserId;
  currentOtherUserEmail = otherUserEmail;

  document.getElementById('chatWithUser').textContent = `Chatting with ${otherUserEmail}`;
  document.getElementById('chatModal').style.display = 'block';
  document.getElementById('chatMessages').innerHTML = '';

  // Load existing messages
  await loadMessages();

  // Set up real-time listener for new messages
  listenToNewMessages();
}

async function loadMessages() {
  const chatRef = ref(db, `chats/${currentChatId}/messages`);
  const snapshot = await get(chatRef);
  const messages = snapshot.val();
  if (messages) {
    displayMessages(Object.values(messages));
  }
}

function listenToNewMessages() {
  const chatRef = ref(db, `chats/${currentChatId}/messages`);
  onValue(chatRef, (snapshot) => {
    const messages = snapshot.val();
    if (messages) {
      displayMessages(Object.values(messages));
    }
  });
}

function displayMessages(messages) {
  const chatMessages = document.getElementById('chatMessages');
  chatMessages.innerHTML = messages
    .sort((a, b) => a.timestamp - b.timestamp)
    .map(msg => `
      <div class="message ${msg.senderId === currentUser.uid ? 'sent' : 'received'}">
        ${escapeHtml(msg.text)}
        <div class="timestamp">${new Date(msg.timestamp).toLocaleString()}</div>
      </div>
    `).join('');
  
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

async function sendMessage(text) {
  if (!text.trim() || !currentChatId || !currentUser) return;

  const chatRef = ref(db, `chats/${currentChatId}/messages`);
  const newMessageRef = push(chatRef);
  
  await set(newMessageRef, {
    text: text.trim(),
    senderId: currentUser.uid,
    senderEmail: currentUser.email,
    timestamp: Date.now()
  });

  // Create notification for the other user
  await createNotification(
    currentOtherUserId,
    'New Message',
    `${currentUser.email} sent you a message`,
    'message',
    currentChatId.split('_')[2],
    { chatId: currentChatId }
  );
  
  // Reload the page after sending message
  window.location.reload();
}

// Event Listeners for Chat
document.querySelector('.close-chat').addEventListener('click', () => {
  document.getElementById('chatModal').style.display = 'none';
  currentChatId = null;
  currentOtherUserId = null;
  currentOtherUserEmail = null;
});

document.getElementById('sendChatMessage').addEventListener('click', async (e) => {
  e.preventDefault(); // Add this line to prevent any default behavior
  const input = document.getElementById('chatMessageInput');
  const text = input.value.trim();
  if (text) {
    await sendMessage(text);
    input.value = ''; // Clear the input after sending
    input.focus(); // Keep focus on input for continuous chatting
  }
});

document.getElementById('chatMessageInput').addEventListener('keypress', async (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    const text = e.target.value.trim();
    if (text) {
      await sendMessage(text);
      e.target.value = ''; // Clear the input after sending
      e.target.focus(); // Keep focus on input
    }
  }
});

// Check authentication state
onAuthStateChanged(auth, (user) => {
  if (user) {
    currentUser = user;
    loadUserProfile(user);
    loadUserPosts(user);
  } else {
    window.location.href = '../index.html';
  }
});

// Load user profile information
function loadUserProfile(user) {
  document.getElementById('userEmail').textContent = user.email;
  const creationTime = new Date(user.metadata.creationTime);
  document.getElementById('memberSince').textContent = `Member since: ${creationTime.toLocaleDateString()}`;
}

// Load user's posts
function loadUserPosts(user) {
  const postsRef = ref(db, 'posts');
  onValue(postsRef, (snapshot) => {
    const data = snapshot.val();
    if (!data) {
      updatePostsDisplay([]);
      updateMyClaimsDisplay([]); // New: clear claims section if no data
      return;
    }

    userPosts = Object.entries(data)
      .filter(([, post]) => post.user.uid === user.uid)
      .map(([id, post]) => ({ id, ...post }))
      .sort((a, b) => b.timestamp - a.timestamp);

    // My Claims (posts claimed by me but not created by me)
    const myClaims = Object.entries(data)
      .filter(([, post]) => post.claimed && post.claimedBy && post.claimedBy.uid === user.uid && post.user.uid !== user.uid)
      .map(([id, post]) => ({ id, ...post }))
      .sort((a, b) => b.timestamp - a.timestamp);

    updateStats();
    updatePostsDisplay(userPosts);
    updateMyClaimsDisplay(myClaims); // Show claims
  });
}

// Display posts the user has claimed (not their own)
function updateMyClaimsDisplay(posts) {
  let claimsSection = document.getElementById('myClaimsSection');
  if (!claimsSection) {
    claimsSection = document.createElement('div');
    claimsSection.id = 'myClaimsSection';
    claimsSection.innerHTML = `<h2><i class='fas fa-hand-holding'></i> My Claims</h2><div class="my-claims-container"></div>`;
    document.querySelector('.main-content').appendChild(claimsSection);
  }
  const container = claimsSection.querySelector('.my-claims-container');
  if (!posts.length) {
    container.innerHTML = '<p>You have not claimed any items.</p>';
    return;
  }
  container.innerHTML = posts.map(post => `
    <div class="post claimed my-claim-card">
      <div class="my-claim-header">
        ${escapeHtml(post.title)}
      </div>
      <img src="${post.imageData || 'default-image.png'}" alt="${escapeHtml(post.title)}" onerror="this.onerror=null;this.src='default-image.png';" />
      <div style="padding: 2rem;">
        ${post.description ? `<div style='font-size:1.2rem; color:#34495e; margin-bottom:1rem;'>${escapeHtml(post.description)}</div>` : ''}
        ${post.labels?.length ? `<div class="labels" style="margin-bottom:1rem;">${post.labels.map(label => `<span class="label">${escapeHtml(label)}</span>`).join('')}</div>` : ''}
        <div class="post-meta" style="display:flex; align-items:center; gap:2rem; margin-bottom:1.5rem;">
          <div class="post-info" style="display:flex; align-items:center; gap:0.5rem; color:#888;">
            <i class="fas fa-clock"></i>
            <span>${new Date(post.timestamp).toLocaleString()}</span>
          </div>
        </div>
        <div class="claim-status claimed">
          <div class="claim-info">
            <i class="fas fa-check-circle"></i>
            <span>Claimed by <span style="font-weight:700; color:#2366b8;">you</span></span>
          </div>
          <button class="chat-btn" onclick="openChat('${post.id}', '${post.user.uid}', '${post.user.email}')">
            <i class="fas fa-comments"></i>
            Chat with owner
          </button>
          <button class="unclaim-btn" onclick="unclaimPost('${post.id}')">
            <i class='fas fa-undo'></i> Unclaim
          </button>
        </div>
      </div>
    </div>
  `).join('');
}

// Update profile statistics
function updateStats() {
  const totalPosts = userPosts.length;
  const itemsClaimed = userPosts.filter(post => post.claimed).length;
  
  document.getElementById('totalPosts').textContent = totalPosts;
  document.getElementById('itemsClaimed').textContent = itemsClaimed;
}

// Update posts display with filtering
function updatePostsDisplay(posts) {
  const postsContainer = document.querySelector('.posts-container');
  
  if (posts.length === 0) {
    postsContainer.innerHTML = '<p>No posts found.</p>';
    return;
  }

  postsContainer.innerHTML = posts.map(post => `
    <div class="post ${post.claimed ? 'claimed' : ''}">
      <div class="post-header">
        <h3>${escapeHtml(post.title)}</h3>
      </div>
      
      <img src="${post.imageData || 'default-image.png'}" alt="${escapeHtml(post.title)}" 
           onerror="this.onerror=null;this.src='default-image.png';" />
      
      ${post.description ? `<p>${escapeHtml(post.description)}</p>` : ''}
      
      ${post.labels?.length ? `
        <div class="labels">
          ${post.labels.map(label => `
            <span class="label">${escapeHtml(label)}</span>
          `).join('')}
        </div>
      ` : ''}
      
      <div class="post-meta">
        <div class="post-info">
          <div class="timestamp">
            <i class="fas fa-clock"></i>
            <span>${new Date(post.timestamp).toLocaleString()}</span>
          </div>
        </div>

        ${post.claimed ? `
          <div class="claim-status claimed">
            <div class="claim-info">
              <i class="fas fa-check-circle"></i>
              <span>Claimed by ${escapeHtml(post.claimedBy?.email || "Unknown")}</span>
            </div>
            ${(currentUser && (currentUser.uid === post.user.uid || currentUser.uid === post.claimedBy?.uid)) ? `
              <button class="chat-btn" onclick="openChat('${post.id}', '${currentUser.uid === post.user.uid ? post.claimedBy.uid : post.user.uid}', '${currentUser.uid === post.user.uid ? post.claimedBy.email : post.user.email}')">
                <i class="fas fa-comments"></i>
                Chat with ${currentUser.uid === post.user.uid ? 'the claimer' : 'the owner'}
              </button>
            ` : ''}
            ${(currentUser && post.claimedBy && currentUser.uid === post.claimedBy.uid) ? `
              <button class="unclaim-btn" onclick="unclaimPost('${post.id}')">
                <i class='fas fa-undo'></i> Unclaim
              </button>
            ` : ''}
          </div>
        ` : `
          <div class="claim-status unclaimed">
            <i class="fas fa-hourglass-half"></i>
            <span>Waiting for claims</span>
          </div>
        `}
      </div>
    </div>
  `).join('');
}

// Handle post filtering
document.querySelector('.posts-filter').addEventListener('click', (e) => {
  if (!e.target.classList.contains('filter-btn')) return;

  // Update active button
  document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
  e.target.classList.add('active');

  // Filter posts
  const filter = e.target.dataset.filter;
  let filteredPosts = [...userPosts];

  switch (filter) {
    case 'claimed':
      filteredPosts = userPosts.filter(post => post.claimed);
      break;
    case 'unclaimed':
      filteredPosts = userPosts.filter(post => !post.claimed);
      break;
  }

  updatePostsDisplay(filteredPosts);
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
    window.location.href = '../main_page/main_page.html';
  });
}

// Helper function to escape HTML
function escapeHtml(text) {
  if (!text) return "";
  return text.replace(/[&<>"']/g, m => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[m]);
}

// Notification functionality
async function createNotification(toUserId, title, message, type, postId, additionalData = {}) {
  if (!toUserId) return;

  const notificationsRef = ref(db, `notifications/${toUserId}`);
  const newNotificationRef = push(notificationsRef);
  
  await set(newNotificationRef, {
    title,
    message,
    type,
    postId,
    timestamp: Date.now(),
    read: false,
    from: {
      uid: currentUser.uid,
      email: currentUser.email
    },
    ...additionalData
  });
}

// --- Notification Dropdown Logic (EXACTLY like main_page.js) ---

// 1. Ensure the dropdown is a child of the notification-container
const notificationContainer = document.querySelector('.notification-container');
let notificationDropdown = notificationContainer.querySelector('.notification-dropdown');
if (!notificationDropdown) {
  notificationDropdown = document.createElement('div');
  notificationDropdown.className = 'notification-dropdown';
  notificationContainer.appendChild(notificationDropdown);
}

let unreadNotifications = 0;

// 2. Badge update function
function updateNotificationBadge(count) {
  const badge = document.getElementById('notificationBadge');
  if (count > 0) {
    badge.style.display = 'block';
    badge.textContent = count;
  } else {
    badge.style.display = 'none';
  }
}

// 3. Listen for notifications (real-time badge)
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

// 4. Load notifications into dropdown
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

  // Add click handler for notification items
  notificationDropdown.querySelectorAll('.notification-item').forEach(item => {
    item.addEventListener('click', async () => {
      const notificationId = item.dataset.id;
      // Mark as read
      await set(ref(db, `notifications/${notificationId}/read`), true);
      item.classList.remove('unread');
      // Redirect for match notifications
      const notification = data[notificationId];
      if (notification.type === 'match' && notification.postId && notification.matchedWithId) {
        window.location.href = `../main_page/post-details.html?id=${encodeURIComponent(notification.postId)}&matchedWith=${encodeURIComponent(notification.matchedWithId)}`;
      } else if (notification.postId) {
        window.location.href = `../main_page/post-details.html?id=${encodeURIComponent(notification.postId)}`;
      }
    });
  });
}

// 5. Toggle dropdown on bell click (not on the badge or dropdown itself)
notificationContainer.addEventListener('click', (e) => {
  // Only toggle if the bell or badge is clicked, not the dropdown itself
  if (e.target.closest('.notification-dropdown')) return;
  notificationDropdown.classList.toggle('show');
  if (notificationDropdown.classList.contains('show')) {
    loadNotifications();
  }
});

// 6. Close dropdown when clicking outside
document.addEventListener('click', (e) => {
  if (!notificationContainer.contains(e.target) && !notificationDropdown.contains(e.target)) {
    notificationDropdown.classList.remove('show');
  }
});

// 7. Listen for notifications when user is logged in
onAuthStateChanged(auth, (user) => {
  currentUser = user;
  if (user) {
    listenForNotifications(user.uid);
  }
});

// Make openChat function globally available
window.openChat = openChat;

// Add unclaimPost function globally
window.unclaimPost = async function(postId) {
  if (!currentUser) return;
  
  // Show loading state
  const unclaimBtn = document.querySelector(`button[onclick="unclaimPost('${postId}')"]`);
  if (unclaimBtn) {
    unclaimBtn.disabled = true;
    unclaimBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Unclaiming...';
  }
  
  try {
    const postRef = ref(db, 'posts/' + postId);
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
    
    alert('Item unclaimed successfully!');
    // Reload the page to reflect the changes immediately
    window.location.reload();
  } catch (error) {
    console.error('Error unclaiming post:', error);
    alert('Failed to unclaim the post.');
    
    // Restore button state on error
    if (unclaimBtn) {
      unclaimBtn.disabled = false;
      unclaimBtn.innerHTML = '<i class="fas fa-undo"></i> Unclaim';
    }
  }
};

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
        <a href="../main_page/post-details.html?id=${encodeURIComponent(notification.postId)}${notification.matchedWithId ? `&matchedWith=${encodeURIComponent(notification.matchedWithId)}` : ''}" 
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
        await set(ref(db, `notifications/${notificationId}/read`), true);
        
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