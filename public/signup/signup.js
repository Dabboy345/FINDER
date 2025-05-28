import { auth } from '../firebase_config.js';
import { createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";

document.getElementById("signupForm").addEventListener("submit", (e) => {
  e.preventDefault();

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value.trim();
  const repeatPassword = document.getElementById("repeatPassword").value.trim();

  if (password !== repeatPassword) {
    alert("Passwords do not match.");
    return;
  }

  // Password validation
  const passwordValidationMessage = validatePassword(password);
  if (passwordValidationMessage) {
    alert(passwordValidationMessage);
    return;
  }

  createUserWithEmailAndPassword(auth, email, password)
    .then((userCredential) => {
      const user = userCredential.user;
      console.log("User created:", user.email);
      alert("Signup successful!");
      window.location.href = "../main_page/main_page.html"; // Or wherever you want
    })
    .catch((error) => {
      console.error(error);
      alert("Signup failed: " + error.message);
    });
});

function validatePassword(password) {
  const hasUpperCase = /[A-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const isLongEnough = password.length >= 8;

  if (!hasUpperCase) {
    return "Password must contain at least one uppercase letter.";
  }
  if (!hasNumber) {
    return "Password must contain at least one number.";
  }
  if (!isLongEnough) {
    return "Password must be at least 8 characters long.";
  }
  return null; // Password is valid
}

// Handle logo click - redirect to home page
const logoElement = document.querySelector('.logo');
if (logoElement) {
  logoElement.addEventListener('click', () => {
    window.location.href = '../index.html';
  });
}