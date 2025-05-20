import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import { getDatabase, ref, onValue } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-database.js";

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

// Redirect buttons
document.querySelector(".lost-btn").addEventListener("click", () => {
  window.location.href = "../post_lost/post_lost.html";
});

document.querySelector(".found-btn").addEventListener("click", () => {
  window.location.href = "../post_found/post_found.html";
});

// Load posts
const postsRef = ref(db, "posts");
const postsContainer = document.getElementById("postsContainer");

onValue(postsRef, (snapshot) => {
  postsContainer.innerHTML = ""; // Clear loading text

  if (!snapshot.exists()) {
    postsContainer.innerHTML = "<p>No posts found.</p>";
    return;
  }

  const posts = snapshot.val();
  Object.values(posts).reverse().forEach((post) => {
    const card = document.createElement("div");
    card.className = "post-card";

    card.innerHTML = `
      <img src="${post.imageUrl}" alt="Found item" />
      <div class="content">
        <h3>${post.title}</h3>
        <p>${post.description}</p>
        <div class="tags">
          ${post.labels.map(label => `<span>${label}</span>`).join('')}
        </div>
        <div class="author">Posted by: ${post.user?.email || "Unknown"}</div>
        <button class="claim-btn">Claim</button>
      </div>
    `;

    postsContainer.appendChild(card);
  });
});
