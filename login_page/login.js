import { getAuth, signInWithEmailAndPassword, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";

const auth = getAuth();

document.getElementById('loginForm').addEventListener('submit', function(e) {
  e.preventDefault();

  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value.trim();

  signInWithEmailAndPassword(auth, email, password)
    .then((userCredential) => {
      // Redirect to main page
      alert("Sucefully Login");
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
