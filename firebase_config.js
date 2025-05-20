// firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";
import { getDatabase, ref, set, update, onValue } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-database.js";
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBmS-i8N6sFOB4khvIpX-_fFN3ITebSS0g",
  authDomain: "finder-ff519.firebaseapp.com",
  projectId: "finder-ff519",
  storageBucket: "finder-ff519.firebasestorage.app",
  messagingSenderId: "989218762868",
  atabaseURL: "https://finder-ff519-default-rtdb.europe-west1.firebasedatabase.app/",
  appId: "1:989218762868:web:7f5160caf34ddccd92e121",
  measurementId: "G-6GM4SYPVHT"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const database = getDatabase(app);


export { app, auth, db };
