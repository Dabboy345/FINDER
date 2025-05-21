import { getAuth, signInWithEmailAndPassword, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";
import { auth } from '../firebase_config.js';

document.getElementById('loginForm').addEventListener('submit', function(e) {
  e.preventDefault();

  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value.trim();

  signInWithEmailAndPassword(auth, email, password)
    .then((userCredential) => {
      // Redirect to main page
      const user = userCredential.user;
      console.log("Logged in:", user.email);
      alert("Login successful!");
      window.location.href = '../main_page/main_page.html';
    })
    .catch((error) => {
      alert("Login failed: " + error.message);
    });
});

function forgotPassword() {
  const email = document.getElementById('email').value.trim();

  if (!email) {
    alert("Please enter your email to reset password.");
    return;
  }

  sendPasswordResetEmail(auth, email)
    .then(() => {
      alert("Password reset email sent!");
    })
    .catch((error) => {
      alert("Error: " + error.message);
    });
}