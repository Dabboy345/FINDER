// Import Firebase modular SDK
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { 
  getAuth, 
  onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";
import { 
  getDatabase, 
  ref, 
  push, 
  set 
} from "https://www.gstatic.com/firebasejs/10.11.0/firebase-database.js";
import { 
  getStorage, 
  ref as storageRef, 
  uploadBytes, 
  getDownloadURL 
} from "https://www.gstatic.com/firebasejs/10.11.0/firebase-storage.js";

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
const auth = getAuth(app);
const db = getDatabase(app);
const storage = getStorage(app);

const postForm = document.getElementById("postForm");

// Validate file type and size
function validateFile(file) {
  const validTypes = ["image/jpeg", "image/png", "image/gif"];
  const maxSize = 5 * 1024 * 1024; // 5MB

  if (!validTypes.includes(file.type)) {
    throw new Error("Invalid file type. Please upload a JPEG, PNG, or GIF image.");
  }

  if (file.size > maxSize) {
    throw new Error("File too large. Maximum size is 5MB.");
  }

  return true;
}

// Ensure user is logged in before allowing post creation
onAuthStateChanged(auth, (user) => {
  if (!user) {
    alert("Please log in to create a post.");
    window.location.href = "../login/login.html";
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

  // Basic validation
  if (!title) {
    alert("Title is required.");
    return;
  }

  if (!fileInput.files.length) {
    alert("Please select an image file.");
    return;
  }

  const file = fileInput.files[0];
  
  try {
    // Validate file
    validateFile(file);
    
    // Show loading state
    const submitBtn = postForm.querySelector('button[type="submit"]');
    const originalBtnText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = "Uploading...";

    // Create storage reference with organized path
    const filePath = `posts/${user.uid}/${Date.now()}_${file.name}`;
    const fileReference = storageRef(storage, filePath);

    // Upload file to Firebase Storage
    const uploadResult = await uploadBytes(fileReference, file);
    
    // Get public download URL
    const imageUrl = await getDownloadURL(uploadResult.ref);

    // Process labels
    const labels = labelsRaw ? 
      labelsRaw.split(",").map(label => label.trim()).filter(Boolean) : 
      [];

    // Prepare post object
    const postData = {
      title,
      description: description || null,
      imageUrl,
      storagePath: filePath, // Store path for potential future deletion
      labels,
      timestamp: Date.now(),
      user: {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName || null
      }
    };

    // Push post to Firebase Realtime Database
    const newPostRef = push(ref(db, "posts"));
    await set(newPostRef, postData);

    // Success handling
    alert("Post submitted successfully!");
    postForm.reset();
    
  } catch (error) {
    console.error("Error submitting post:", error);
    alert(`Error: ${error.message}`);
  } finally {
    // Reset button state
    const submitBtn = postForm.querySelector('button[type="submit"]');
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = originalBtnText;
    }
  }
});

// Helper function to display upload progress (optional)
function setupUploadProgress(fileInput) {
  const progressBar = document.createElement("div");
  progressBar.style.width = "100%";
  progressBar.style.height = "5px";
  progressBar.style.backgroundColor = "#eee";
  progressBar.style.marginTop = "10px";
  
  const progressFill = document.createElement("div");
  progressFill.style.height = "100%";
  progressFill.style.backgroundColor = "#4CAF50";
  progressFill.style.width = "0%";
  progressBar.appendChild(progressFill);
  
  fileInput.parentNode.insertBefore(progressBar, fileInput.nextSibling);
  
  return (percentage) => {
    progressFill.style.width = `${percentage}%`;
  };
}