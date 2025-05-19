// Update import path to point to Public folder
import { auth } from "../Public/firebase_config.js";
import { createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";
import { getFirestore, doc, setDoc } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";

// Initialize Firestore
const db = getFirestore();

document.addEventListener('DOMContentLoaded', () => {
  const signupForm = document.getElementById('signup-form');
  const cancelButton = document.getElementById('cancel-button');
  const loginButton = document.getElementById('login-btn');
  const passwordInput = document.getElementById('password');
  const confirmPasswordInput = document.getElementById('confirm-password');
  const passwordMatchMessage = document.getElementById('password-match');

  // Password validation elements
  const uppercaseRequirement = document.getElementById('uppercase');
  const numberRequirement = document.getElementById('number');
  const lengthRequirement = document.getElementById('length');

  // Real-time password validation
  passwordInput.addEventListener('input', validatePassword);
  confirmPasswordInput.addEventListener('input', validatePasswordMatch);

  // Cancel button - go back to login page
  cancelButton.addEventListener('click', () => {
    window.location.href = 'index.html';
  });

  // Login button - go to login page
  loginButton.addEventListener('click', () => {
    window.location.href = 'index.html';
  });

  // Form submission
  signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const name = document.getElementById('name').value.trim();
    const email = document.getElementById('email').value.trim();
    const degree = document.getElementById('degree').value.trim();
    const password = passwordInput.value;
    const confirmPassword = confirmPasswordInput.value;

    // Validate form
    if (!validateForm(name, email, degree, password, confirmPassword)) {
      return;
    }

    try {
      // Create user with Firebase Auth
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Save additional user data to Firestore
      await setDoc(doc(db, 'users', user.uid), {
        name: name,
        email: email,
        degree: degree,
        createdAt: new Date()
      });

      // Redirect to home page after successful signup
      window.location.href = 'home.html';
    } catch (error) {
      console.error('Error signing up:', error);
      alert('Error: ' + error.message);
    }
  });

  // Validate password in real-time
  function validatePassword() {
    const password = passwordInput.value;
    
    // Check uppercase
    if (/[A-Z]/.test(password)) {
      uppercaseRequirement.classList.add('valid');
    } else {
      uppercaseRequirement.classList.remove('valid');
    }
    
    // Check number
    if (/\d/.test(password)) {
      numberRequirement.classList.add('valid');
    } else {
      numberRequirement.classList.remove('valid');
    }
    
    // Check length
    if (password.length >= 8) {
      lengthRequirement.classList.add('valid');
    } else {
      lengthRequirement.classList.remove('valid');
    }
  }

  // Validate password match in real-time
  function validatePasswordMatch() {
    const password = passwordInput.value;
    const confirmPassword = confirmPasswordInput.value;
    
    if (confirmPassword === '') {
      passwordMatchMessage.textContent = '';
      passwordMatchMessage.className = 'validation-message';
    } else if (password === confirmPassword) {
      passwordMatchMessage.textContent = 'Passwords match';
      passwordMatchMessage.className = 'validation-message success';
    } else {
      passwordMatchMessage.textContent = 'Passwords do not match';
      passwordMatchMessage.className = 'validation-message error';
    }
  }

  // Validate entire form before submission
  function validateForm(name, email, degree, password, confirmPassword) {
    // Check if all fields are filled
    if (!name || !email || !degree || !password || !confirmPassword) {
      alert('Please fill in all fields');
      return false;
    }
    
    // Validate email format
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      alert('Please enter a valid email address');
      return false;
    }
    
    // Check if password meets requirements
    if (!/(?=.*[A-Z])(?=.*\d).{8,}/.test(password)) {
      alert('Password does not meet requirements');
      return false;
    }
    
    // Check if passwords match
    if (password !== confirmPassword) {
      alert('Passwords do not match');
      return false;
    }
    
    return true;
  }
});