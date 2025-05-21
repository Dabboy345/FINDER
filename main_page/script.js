// Import Firebase modular SDK
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";
import { getDatabase, ref, push, set } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-database.js";

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
const auth = getAuth(app);

const imgbbApiKey = "7f5b86f1efb5c249bafe472c9078a76d";

const postForm = document.getElementById("postForm");

// Ensure user is logged in before allowing post creation
onAuthStateChanged(auth, (user) => {
  if (!user) {
    alert("Please log in to create a post.");
    window.location.href = "../login/login.html";  // Adjust as necessary
  }
});

postForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const user = auth.currentUser;
  if (!user) {
    alert("You must be logged in to post.");
    return;
  }

  // Gather form data
  const title = postForm.title.value.trim();
  const description = postForm.description.value.trim();
  const fileInput = postForm.imageFile;
  const labelsRaw = postForm.labels.value.trim();

  if (!title) {
    alert("Title is required.");
    return;
  }

  if (!fileInput.files.length) {
    alert("Please select an image file.");
    return;
  }

  const labels = labelsRaw ? labelsRaw.split(",").map(label => label.trim()).filter(Boolean) : [];

  try {
    // Convert image file to base64
    const imageBase64 = await toBase64(fileInput.files[0]);

    // Upload to imgbb and get URL
    const imageUrl = await uploadToImgbb(imageBase64);

    // Prepare post object
    const postData = {
      title,
      description: description || null,
      imageUrl,
      labels,
      timestamp: Date.now(),
      user: {
        uid: user.uid,
        email: user.email
      }
    };

    // Push post to Firebase Realtime Database
    const newPostRef = push(ref(db, "posts"));
    await set(newPostRef, postData);

    alert("Post submitted successfully!");
    postForm.reset();

  } catch (error) {
    console.error("Error submitting post:", error);
    alert("Failed to submit post. Please try again.");
  }
});

// Helper: Convert file to Base64 string
function toBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result.split(",")[1]); // Remove "data:image/xxx;base64," prefix
    reader.onerror = error => reject(error);
  });
}

// Helper: Upload image to imgbb and return image URL
async function uploadToImgbb(base64Image) {
  const formData = new FormData();
  formData.append("key", imgbbApiKey);
  formData.append("image", base64Image);

  const response = await fetch("https://api.imgbb.com/1/upload", {
    method: "POST",
    body: formData
  });

  const data = await response.json();

  if (!data.success) {
    throw new Error(data.error?.message || "Image upload failed");
  }

  return data.data.url;
}