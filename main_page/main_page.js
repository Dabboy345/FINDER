import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { getDatabase, ref, onValue } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-database.js";

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

const postsContainer = document.querySelector(".posts-container");

// Fetch and render posts
const postsRef = ref(db, "posts");
onValue(postsRef, (snapshot) => {
  const data = snapshot.val();
  if (!data) {
    postsContainer.innerHTML = "<p>No posts found.</p>";
    return;
  }

  const posts = Object.values(data).sort((a, b) => b.timestamp - a.timestamp);
  postsContainer.innerHTML = posts.map(post => `
    <div class="post">
      <h3>${escapeHtml(post.title)}</h3>
      <img src="${post.imageUrl}" alt="${escapeHtml(post.title)}" />
      <p>${escapeHtml(post.description)}</p>
      <p><strong>Labels:</strong> ${post.labels?.map(escapeHtml).join(", ") || "None"}</p>
      <p><small>By: ${escapeHtml(post.user?.email || "Unknown")}</small></p>
      <p><small>${new Date(post.timestamp).toLocaleString()}</small></p>
    </div>
  `).join("");
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
