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
}

// Event Listeners for Chat
document.querySelector('.close-chat').addEventListener('click', () => {
  document.getElementById('chatModal').style.display = 'none';
  currentChatId = null;
  currentOtherUserId = null;
  currentOtherUserEmail = null;
});

document.getElementById('sendChatMessage').addEventListener('click', async () => {
  const input = document.getElementById('chatMessageInput');
  await sendMessage(input.value);
  input.value = '';
});

document.getElementById('chatMessageInput').addEventListener('keypress', async (e) => {
  if (e.key === 'Enter') {
    await sendMessage(e.target.value);
    e.target.value = '';
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
      return;
    }

    userPosts = Object.entries(data)
      .filter(([, post]) => post.user.uid === user.uid)
      .map(([id, post]) => ({ id, ...post }))
      .sort((a, b) => b.timestamp - a.timestamp);

    updateStats();
    updatePostsDisplay(userPosts);
  });
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
            ${currentUser && (currentUser.uid === post.user.uid || currentUser.uid === post.claimedBy?.uid) ? `
              <button class="chat-btn" onclick="openChat('${post.id}', '${
                currentUser.uid === post.user.uid ? post.claimedBy.uid : post.user.uid
              }', '${
                currentUser.uid === post.user.uid ? post.claimedBy.email : post.user.email
              }')">
                <i class="fas fa-comments"></i>
                Chat with the claimer
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

// Make openChat function globally available
window.openChat = openChat; 