import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { getDatabase, ref, get, update, set, push } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-database.js";
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

function renderPostDetails(post, isOwner, postId, matchedWithPost = null) {
  const container = document.getElementById('postDetailsContainer');
  let html = `
    <div class="post-details-card">
      <h2>${escapeHtml(post.title)}</h2>
      <img src="${post.imageData || 'default-image.png'}" alt="${escapeHtml(post.title)}" style="max-width:300px;margin:1rem 0;border-radius:8px;" onerror="this.onerror=null;this.src='default-image.png';" />
      <p>${escapeHtml(post.description || '')}</p>
      ${post.labels?.length ? `
        <div class="labels">
          ${post.labels.map(label => `<span class="label">${escapeHtml(label)}</span>`).join('')}
        </div>
      ` : ''}
      <div class="post-meta">
        <div><i class="fas fa-user"></i> ${escapeHtml(post.user?.email || "Unknown")}</div>
        <div><i class="fas fa-clock"></i> ${formatDate(post.timestamp)}</div>
        ${post.lastEdited ? `<div><i class="fas fa-edit"></i> Edited ${formatDate(post.lastEdited)}</div>` : ''}
      </div>
      <div style="margin-top:1rem;">
        ${post.claimed ? `
          <div class="claim-status claimed">
            <i class="fas fa-check-circle"></i>
            Claimed by ${escapeHtml(post.claimedBy?.email || "Unknown")}
          </div>
        ` : isOwner ? `
          <div class="owner-message">
            <i class="fas fa-info-circle"></i>
            This is your post - waiting for someone to claim it
          </div>
        ` : `
          <button class="btn" id="claimBtn"><i class="fas fa-hand-holding"></i> Claim Item</button>
        `}
        ${isOwner ? `
          <button class="btn" id="editBtn"><i class="fas fa-edit"></i> Edit</button>
          <button class="btn" id="deleteBtn"><i class="fas fa-trash"></i> Delete</button>
        ` : ''}
      </div>
    </div>
  `;

  // If matchedWithPost is present, show both posts side by side
  if (matchedWithPost) {
    html = `
      <div style="display:flex;gap:2rem;flex-wrap:wrap;justify-content:center;">
        <div style="flex:1;min-width:220px;max-width:350px;">
          <h3>Your Post</h3>
          <div><strong>${escapeHtml(matchedWithPost.title)}</strong></div>
          ${matchedWithPost.imageData ? `<img src="${matchedWithPost.imageData}" alt="Your Post" style="max-width:100%;margin:10px 0;border-radius:8px;" onerror="this.onerror=null;this.src='default-image.png';" />` : ''}
          <div>${escapeHtml(matchedWithPost.description || '')}</div>
          <div style="margin-top:0.5rem;">
            ${(matchedWithPost.labels || []).map(l => `<span class="label">${escapeHtml(l)}</span>`).join(' ')}
          </div>
        </div>
        <div style="flex:1;min-width:220px;max-width:350px;">
          <h3>Matched Post</h3>
          <div><strong>${escapeHtml(post.title)}</strong></div>
          ${post.imageData ? `<img src="${post.imageData}" alt="Matched Post" style="max-width:100%;margin:10px 0;border-radius:8px;" onerror="this.onerror=null;this.src='default-image.png';" />` : ''}
          <div>${escapeHtml(post.description || '')}</div>
          <div style="margin-top:0.5rem;">
            ${(post.labels || []).map(l => `<span class="label">${escapeHtml(l)}</span>`).join(' ')}
          </div>
        </div>
      </div>
    `;
  }

  container.innerHTML = html;

  // Add claim, edit, and delete handlers
  if (!post.claimed && !isOwner && document.getElementById('claimBtn')) {
    document.getElementById('claimBtn').onclick = async () => {
      alert('Claim functionality from details page not implemented in this snippet.');
      // You can reuse your claim modal logic here if needed
    };
  }
  if (isOwner && document.getElementById('editBtn')) {
    document.getElementById('editBtn').onclick = async () => {
      alert('Edit functionality from details page not implemented in this snippet.');
      // You can reuse your edit modal logic here if needed
    };
  }
  if (isOwner && document.getElementById('deleteBtn')) {
    document.getElementById('deleteBtn').onclick = async () => {
      if (confirm("Are you sure you want to delete this post?")) {
        await set(ref(db, `posts/${postId}`), null);
        alert("Post deleted.");
        window.location.href = "main_page.html";
      }
    };
  }
}

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