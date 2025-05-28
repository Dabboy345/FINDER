import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";

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

// Check if user is already logged in
auth.onAuthStateChanged((user) => {
  if (user) {
    window.location.href = 'main_page/main_page.html';
  }
});

// Handle login form submission
document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value.trim();

  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    console.log("Logged in:", userCredential.user.email);
    window.location.href = './main_page/main_page.html';
  } catch (error) {
    console.error("Login error:", error);
    alert(error.message);
  }
});

// Handle forgot password
document.getElementById('forgotPasswordBtn').addEventListener('click', async () => {
  const email = document.getElementById('email').value.trim();
  
  if (!email) {
    alert("Please enter your email address to reset your password.");
    return;
  }

  try {
    await sendPasswordResetEmail(auth, email);
    alert("Password reset email sent! Please check your inbox.");
  } catch (error) {
    console.error("Password reset error:", error);
    alert(error.message);
  }
});

// Handle sign up button
document.getElementById('signInBtn').addEventListener('click', () => {
  window.location.href = './signup/signup.html';
});

// Handle logo click - stay on login page
const logoContainer = document.querySelector('.logo-container');
if (logoContainer) {
  logoContainer.addEventListener('click', () => {
    window.location.href = './index.html';
  });
}

// Handle logo text click
const logoText = document.querySelector('.logo-text');
if (logoText) {
  logoText.addEventListener('click', () => {
    window.location.href = './index.html';
  });
}
