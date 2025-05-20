// At the top of feed.js
import firebaseConfig from './firebase_config.js';
import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import 'firebase/compat/firestore';

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

document.addEventListener('DOMContentLoaded', function() {
    const postsContainer = document.querySelector('.posts-container');
    
    // Fetch posts from Firestore
    db.collection('posts').orderBy('timestamp', 'desc').limit(10).get()
        .then((querySnapshot) => {
            postsContainer.innerHTML = ''; // Clear loading content
            
            querySnapshot.forEach((doc) => {
                const post = doc.data();
                const postElement = createPostElement(post);
                postsContainer.appendChild(postElement);
            });
        })
        .catch((error) => {
            console.error("Error getting posts: ", error);
            postsContainer.innerHTML = '<p class="error">Error loading posts. Please try again later.</p>';
        });
    
    // ... rest of your event listeners ...
});

function createPostElement(post) {
    const postDiv = document.createElement('div');
    postDiv.className = `post ${post.type.toLowerCase()}`;
    
    // Format the post HTML based on the data
    postDiv.innerHTML = `
        <div class="post-content">
            <h3>${post.title}</h3>
            <div class="post-meta">
                <span class="post-type">${post.type.toUpperCase()}</span>
                <span class="post-category">${post.category}</span>
                <span class="post-location"><i class="fas fa-map-marker-alt"></i> ${post.location}</span>
                <span class="post-time"><i class="far fa-clock"></i> ${formatTime(post.timestamp)}</span>
            </div>
        </div>
        <div class="post-author">
            <div class="author-avatar">${post.authorName.charAt(0)}</div>
            <span class="author-name">${post.authorName}</span>
        </div>
    `;
    
    return postDiv;
}

function formatTime(timestamp) {
    // Convert Firestore timestamp to readable time
    const date = timestamp.toDate();
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}