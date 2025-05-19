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
