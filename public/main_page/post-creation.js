import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";
import { getDatabase, ref, push } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-database.js";

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
  const labels = document.getElementById('labels').value
    .split(',')
    .map(label => label.trim())
    .filter(Boolean);

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

    // Save to Firebase
    await push(ref(db, 'posts'), post);

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