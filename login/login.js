// login.js
import { auth } from '../firebase_config.js';
import { signInWithEmailAndPassword, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const email = e.target.email.value.trim();
  const password = e.target.password.value.trim();

  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    alert("Login successful!");
    window.location.href = '../main_page/main_page.html';
  } catch (error) {
    alert("Login failed: " + error.message);
  }
});

window.forgotPassword = async function() {
  const email = document.getElementById('email').value.trim();
  if (!email) {
    alert("Please enter your email.");
    return;
  }
  try {
    await sendPasswordResetEmail(auth, email);
    alert("Password reset email sent!");
  } catch (error) {
    alert("Error: " + error.message);
  }
}
