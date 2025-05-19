import { getAuth, createUserWithEmailAndPassword, updateProfile } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";

const auth = getAuth();

document.getElementById('signupForm').addEventListener('submit', function (e) {
  e.preventDefault();

  const name = document.getElementById('name').value.trim();
  const email = document.getElementById('email').value.trim();
  const degree = document.getElementById('degree').value.trim();
  const password = document.getElementById('password').value;
  const repeatPassword = document.getElementById('repeatPassword').value;

  if (password !== repeatPassword) {
    alert("Passwords do not match.");
    return;
  }

  const passwordRegex = /^(?=.*[A-Z])(?=.*\d).{8,}$/;
  if (!passwordRegex.test(password)) {
    alert("Password must include one uppercase letter, one number, and be at least 8 characters.");
    return;
  }

  createUserWithEmailAndPassword(auth, email, password)
    .then((userCredential) => {
      updateProfile(userCredential.user, {
        displayName: name
      }).then(() => {
        // Store extra info like degree in your Firestore or Database if needed
        alert("Account created successfully!");
        window.location.href = "../main_page/main_page.html";
      });
    })
    .catch((error) => {
      alert("Sign up failed: " + error.message);
    });
});
