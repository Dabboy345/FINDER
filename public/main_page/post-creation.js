import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";
import { getDatabase, ref, push, get, set, onValue } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-database.js";

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
let postType = 'lost'; // Default post type

// Check authentication state
onAuthStateChanged(auth, (user) => {
  if (user) {
    currentUser = user;
  } else {
    window.location.href = '../index.html';
  }
});

// Handle post type selection
const typeButtons = document.querySelectorAll('.type-btn');
typeButtons.forEach(button => {
  button.addEventListener('click', () => {
    typeButtons.forEach(btn => btn.classList.remove('active'));
    button.classList.add('active');
    postType = button.dataset.type;
  });
});

// Handle image preview
const imageInput = document.getElementById('image');
const imagePreview = document.getElementById('imagePreview');
const uploadPlaceholder = document.querySelector('.upload-placeholder');

imageInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      imagePreview.src = e.target.result;
      imagePreview.style.display = 'block';
      uploadPlaceholder.style.display = 'none';
    };
    reader.readAsDataURL(file);
  }
});

// Handle form submission
const postForm = document.getElementById('postForm');
postForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const title = document.getElementById('title').value;
  const description = document.getElementById('description').value;
  let labels = document.getElementById('labels').value
    .split(',')
    .map(label => label.trim())
    .filter(Boolean);

  // Ensure the selected post type ("lost" or "found") is included as a label
  if (!labels.map(l => l.toLowerCase()).includes(postType)) {
    labels.unshift(postType);
  }

  // Get base64 image data
  const imageData = imagePreview.style.display !== 'none' ? imagePreview.src : null;

  try {
    // Create post object
    const post = {
      title,
      description,
      labels,
      imageData,
      type: postType,
      timestamp: Date.now(),
      user: {
        uid: currentUser.uid,
        email: currentUser.email
      },
      claimed: false
    };

    // Save to Firebase and get the new post reference
    const newPostRef = await push(ref(db, 'posts'), post);

    // --- AUTOMATIC MATCHING FUNCTIONALITY ---
    // Try to find a matching post of the opposite type
    const postsSnapshot = await get(ref(db, 'posts'));
    const postsData = postsSnapshot.val();
    if (postsData) {
      for (const [otherPostId, otherPost] of Object.entries(postsData)) {
        if (otherPostId === newPostRef.key) continue; // skip self
        if (!otherPost.labels) continue;
        const otherLabels = otherPost.labels.map(l => l.toLowerCase());
        const otherType = otherPost.type?.toLowerCase();
        // Only match lost <-> found
        if ((postType === "lost" && otherType === "found") || (postType === "found" && otherType === "lost")) {
          // Find shared labels (excluding "lost"/"found")
          const shared = labels
            .map(l => l.toLowerCase())
            .filter(l => l !== "lost" && l !== "found" && otherLabels.includes(l));
          if (shared.length > 0) {
            // Notify both users (store a notification in the database)
            const notificationsRef = ref(db, 'notifications');
            // Notify current user
            await push(notificationsRef, {
              to: currentUser.uid,
              title: 'Potential Match Found!',
              message: `We found a matching "${otherType}" post: "${otherPost.title}" with labels: ${shared.join(", ")}`,
              type: 'match',
              postId: otherPostId,
              timestamp: Date.now(),
              read: false
            });
            // Notify other user
            if (otherPost.user && otherPost.user.uid) {
              await push(notificationsRef, {
                to: otherPost.user.uid,
                title: 'Potential Match Found!',
                message: `We found a matching "${postType}" post: "${title}" with labels: ${shared.join(", ")}`,
                type: 'match',
                postId: newPostRef.key,
                timestamp: Date.now(),
                read: false
              });
            }
            // Only notify for the first match found
            break;
          }
        }
      }
    }
    // --- END MATCHING FUNCTIONALITY ---

    // Redirect to main page
    window.location.href = 'main_page.html';
  } catch (error) {
    console.error('Error creating post:', error);
    alert('Error creating post. Please try again.');
  }
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
    window.location.href = './main_page.html';
  });
}

// --- Notification Dropdown Logic (EXACTLY like main_page.js) ---

const notificationContainer = document.querySelector('.notification-container');
let notificationDropdown = notificationContainer.querySelector('.notification-dropdown');
if (!notificationDropdown) {
  notificationDropdown = document.createElement('div');
  notificationDropdown.className = 'notification-dropdown';
  notificationContainer.appendChild(notificationDropdown);
}

let unreadNotifications = 0;

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

  notificationDropdown.querySelectorAll('.notification-item').forEach(item => {
    item.addEventListener('click', async () => {
      const notificationId = item.dataset.id;
      await set(ref(db, `notifications/${notificationId}/read`), true);
      item.classList.remove('unread');
      const notification = data[notificationId];
      if (notification.type === 'match' && notification.postId && notification.matchedWithId) {
        window.location.href = `post-details.html?id=${encodeURIComponent(notification.postId)}&matchedWith=${encodeURIComponent(notification.matchedWithId)}`;
      } else if (notification.postId) {
        window.location.href = `post-details.html?id=${encodeURIComponent(notification.postId)}`;
      }
    });
  });
}

notificationContainer.addEventListener('click', (e) => {
  if (e.target.closest('.notification-dropdown')) return;
  notificationDropdown.classList.toggle('show');
  if (notificationDropdown.classList.contains('show')) {
    loadNotifications();
  }
});

document.addEventListener('click', (e) => {
  if (!notificationContainer.contains(e.target) && !notificationDropdown.contains(e.target)) {
    notificationDropdown.classList.remove('show');
  }
});

onAuthStateChanged(auth, (user) => {
  currentUser = user;
  if (user) {
    listenForNotifications(user.uid);
  }
});

// Notification container HTML
const notificationContainerHTML = `
  <div class="notification-container">
    <i class="fas fa-bell"></i>
    <span id="notificationBadge">0</span>
  </div>
`;

// Insert notification container HTML into the page
document.body.insertAdjacentHTML('afterbegin', notificationContainerHTML);