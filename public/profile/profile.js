import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";
import { getDatabase, ref, onValue, query, orderByChild, equalTo } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-database.js";

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
        <div class="timestamp">
          <i class="fas fa-clock"></i>
          <span>${new Date(post.timestamp).toLocaleString()}</span>
        </div>
        ${post.claimed ? `
          <div class="claim-status claimed">
            <i class="fas fa-check-circle"></i>
            <span>Claimed by ${escapeHtml(post.claimedBy?.email || "Unknown")}</span>
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