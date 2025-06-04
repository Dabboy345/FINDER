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
            ${(currentUser && post.user && currentUser.uid === post.user.uid) ? `
              <button class="mark-returned-btn" onclick="markAsReturned('${post.id}')">
                <i class="fas fa-check-circle"></i>
                Mark as ${post.type?.toLowerCase() === 'lost' ? 'Retrieved' : 'Returned'}
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

  const notificationsRef = ref(db, 'notifications');
  const newNotificationRef = push(notificationsRef);
  
  await set(newNotificationRef, {
    to: toUserId,
    title,
    message,
    type,
    postId,
    timestamp: Date.now(),
    lastUpdated: Date.now(),
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
    const timeString = formatDate(notification.lastUpdated || notification.timestamp);
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

// Notification detail modal functionality
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

// Add delete notification functionality with null check
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

// Show notification detail function
async function showNotificationDetail(notification) {
  // Set the notification ID for the delete button - add null check
  const deleteBtn = document.getElementById('deleteNotificationBtn');
  if (deleteBtn) {
    deleteBtn.dataset.notificationId = notification.id;
  }

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

// Helper functions for notification display
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

function formatMessage(message) {
  if (!message) return '';
  return escapeHtml(message).replace(/\n/g, '<br>');
}

async function getPostById(postId) {
  const postRef = ref(db, `posts/${postId}`);
  const snapshot = await get(postRef);
  return snapshot.exists() ? snapshot.val() : null;
}

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

// Function to mark post as returned/retrieved for post owners
async function markAsReturned(postId) {
  if (!currentUser) {
    alert("Please log in to mark items as returned.");
    return;
  }

  const post = userPosts.find(p => p.id === postId);
  if (!post) {
    alert("Post not found.");
    return;
  }

  // Only the post owner can mark their post as returned
  if (!post.user || post.user.uid !== currentUser.uid) {
    alert("You can only mark your own posts as returned.");
    return;
  }

  // Only claimed posts can be marked as returned
  if (!post.claimed) {
    alert("This post hasn't been claimed yet.");
    return;
  }

  const postType = post.type?.toLowerCase();
  const actionText = postType === 'lost' ? 'retrieved' : 'returned';
  const confirmMessage = `Are you sure you want to mark this item as ${actionText}? This will delete the post permanently.`;
  
  if (!confirm(confirmMessage)) {
    return;
  }

  // Show loading state
  const markBtn = document.querySelector(`button[onclick*="markAsReturned('${postId}')"]`);
  if (markBtn) {
    markBtn.disabled = true;
    markBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
  }

  try {
    // Send notification to the claimer
    if (post.claimedBy) {
      const notificationsRef = ref(db, 'notifications');
      const returnNotification = {
        to: post.claimedBy.uid,
        title: `Item ${actionText.charAt(0).toUpperCase() + actionText.slice(1)}!`,
        message: `The item "${post.title}" has been marked as ${actionText} by the owner. Thank you for helping!`,
        type: 'returned',
        postId: postId,
        timestamp: Date.now(),
        read: false
      };
      await push(notificationsRef, returnNotification);
    }

    // Delete the post from the database
    const postRef = ref(db, `posts/${postId}`);
    await set(postRef, null);

    // Also remove any related claim entries
    const claimsRef = ref(db, 'claims');
    const claimsSnapshot = await get(claimsRef);
    const claims = claimsSnapshot.val();
    
    if (claims) {
      const claimEntriesToRemove = Object.entries(claims).filter(([, claim]) => 
        claim.postId === postId
      );
      
      for (const [claimId] of claimEntriesToRemove) {
        await set(ref(db, `claims/${claimId}`), null);
      }
    }

    alert(`🎉 Great! Your item has been marked as ${actionText}. The post has been removed.`);
    // Reload the page to reflect the changes immediately
    window.location.reload();
  } catch (error) {
    console.error(`Error marking item as ${actionText}:`, error);
    alert(`Error marking item as ${actionText}. Please try again.`);
    
    // Restore button state on error
    if (markBtn) {
      markBtn.disabled = false;
      const btnText = postType === 'lost' ? 'Mark as Retrieved' : 'Mark as Returned';
      markBtn.innerHTML = `<i class="fas fa-check-circle"></i> ${btnText}`;
    }
  }
}

// Make markAsReturned function globally available
window.markAsReturned = markAsReturned;