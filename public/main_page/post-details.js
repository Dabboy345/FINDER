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