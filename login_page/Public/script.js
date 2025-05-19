import { auth } from "./firebase_config.js";
import {
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  createUserWithEmailAndPassword,
} from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";

document.getElementById("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;

  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
    alert("Error: " + error.message);
  }
});

document.getElementById("forgot-password").addEventListener("click", async () => {
  const email = document.getElementById("email").value;
  if (!email) return alert("Please enter your email first.");
  try {
    await sendPasswordResetEmail(auth, email);
    alert("Password reset email sent.");
  } catch (error) {
    alert("Error: " + error.message);
  }
});

document.getElementById("signup-btn").addEventListener("click", async () => {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;

  try {
    await createUserWithEmailAndPassword(auth, email, password);
    alert("Account created successfully!");
  } catch (error) {
    alert("Error: " + error.message);
  }
});
