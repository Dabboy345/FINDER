# FINDER

An App aimed at to the university students to help to recuparate their lost items in the university. 

---

## Table of Contents

* [About the Project](#about-the-project)
    * [Members](#members)
* [Features](#features)
* [Technologies Used](#technologies-used)
* [App Architecture](#app-architecture)
* [Videos & Demonstrations](#videos--demonstrations)
* [Getting Started](#getting-started)
    * [Prerequisites](#prerequisites)
    * [Installation](#installation)


---

## About the Project

An app aimed at university students where they can create a community and post there the objects that they have lost in the university and other users can participate in the post and help them to find their lost items, further universities could also participate and add post where they post the lost items of the students. 

The objective of our app is to help the users find their lost items in the university. Finder aims to improve the chances of item recovery while fostering a sense of community and mutual assistance among students and faculty.

---

## Members
This is our Project for the course Software engineering(course 2025). We are Group 12 formed by:
 - Alex Roig 
 - Claudia Hereter
 - Jana Baguer
 - Oscar Salueña
 - Paula Navarro
 - Sushant Pokhrel


## Features

FINDER offers a comprehensive set of features designed to help university students recover their lost items:

### Core Features
* **User Authentication:** Secure login and registration system for university students
* **Main Feed:** Browse all lost and found posts from the community in real-time
* **Post Creation:** Create detailed posts for lost or found items with:
  - Post type selection (Lost/Found)
  - Title and description
  - Image upload capabilities
  - Categorization with labels
* **Post Management:** Edit, delete, and manage your own posts
* **Detailed Post View:** Comprehensive post details with metadata and interaction options

### Communication Features
* **Real-time Chat System:** Direct messaging between users about specific items
* **Claim System:** Send messages to item owners/finders to claim items
* **User Tagging:** Tag other users in post descriptions using @email format

### Advanced Features
* **Smart Matching Algorithm:** Automatically find potential matches between lost and found items based on:
  - Item characteristics and labels
  - Multilingual support (English, Spanish, Catalan, French)
  - Semantic similarity analysis
* **Profile Management:** Personal dashboard showing:
  - Your posted items
  - Items you've claimed
  - Post filtering options (all, claimed, unclaimed)
  - User statistics

### Interaction Features
* **Item Claiming:** Claim found items or respond to lost item posts
* **Status Management:** Mark items as returned/retrieved
* **Unclaim Functionality:** Remove claims if needed

---

## Technologies Used

These are the technologies that we have used for our project.

* **Frontend:**
    * `HTML`
    * `CSS`
    * `JavaScript`
* **Backend:**
    * `Firebase`
* **Database:**
    * `Firebase`
* **Other Tools:**
    * `Git`
    * `Github`

---

## App Architecture

FINDER is built using a modern web architecture with the following components:
![FINDER Architecture](./public/FINDER%20Architecture.png)

### Frontend Architecture
* **Single Page Application (SPA):** Client-side routing and dynamic content loading
* **Modular Design:** Organized into distinct sections:
  - Authentication pages (Login/Signup)
  - Main feed with post display
  - Post creation and management
  - User profile dashboard
  - Real-time chat system

### Backend & Database
* **Firebase Realtime Database:** NoSQL database for storing:
  - User posts and metadata
  - Chat messages and conversations
  - User claims and interactions
  - Real-time notifications
* **Firebase Authentication:** Secure user management and session handling
* **Firebase Hosting:** Static web hosting with custom domain support.Not avaliable at the moment. 

### Real-time Features
* **Live Data Synchronization:** Posts, messages, and notifications update in real-time
* **Event-driven Architecture:** Listeners for database changes trigger UI updates
* **Notification System:** Real-time alerts for user interactions

### File Structure
```
FINDER/
├── cors.json                 # CORS configuration
├── firebase.json             # Firebase hosting configuration
├── package.json              # Project dependencies and scripts
├── README.md                 # Project documentation
├── storage.rules             # Firebase storage security rules
└── public/                   # Frontend application
    ├── index.html            # Login/Landing page
    ├── index.js              # Login page logic
    ├── index.css             # Login page styles
    ├── FINDER_LOGO.jpeg      # Application logo
    ├── firebase_config.js    # Firebase configuration
    ├── config.example.js     # Configuration template
    ├── about/                # About page
    │   ├── about.html
    │   └── about.css
    ├── contact/              # Contact page
    │   ├── contact.html
    │   └── contact.css
    ├── signup/               # User registration
    │   ├── signup.html
    │   ├── signup.js
    │   └── signup.css
    ├── profile/              # User dashboard
    │   ├── profile.html
    │   ├── profile.js
    │   └── profile.css
    └── main_page/            # Core application features
        ├── main_page.html    # Main feed interface
        ├── main_page.js      # Main feed logic
        ├── main_page.css     # Main feed styles
        ├── post-creation.html # Post creation interface
        ├── post-creation.js  # Post creation logic
        ├── post-creation.css # Post creation styles
        ├── post-details.html # Individual post view
        ├── post-details.js   # Post details logic
        ├── post-details.css  # Post details styles
        ├── script.js         # Additional utilities
        ├── style.css         # Additional styles
        └── default-image.png # Fallback image
```

### Security & Performance
* **Authentication-based Access Control:** All features require user login
* **Real-time Validation:** Client-side and server-side data validation
* **Optimized Loading:** Efficient data fetching and caching strategies

---

## Videos & Demonstrations

This section contains video demonstrations and tutorials for the FINDER application:
**[INTRODUCTION](link)**
### App Demo Videos
* **Complete Application Demo:** Full walkthrough of all FINDER features and functionality
* **User Journey Video:** Step-by-step demonstration of typical user workflows
* **Feature Showcase:** Individual feature demonstrations and use cases:
**[DEMO VIDEO](https://shorturl.at/kQv6c)**
---

## Getting Started

Instructions on how to set up and run your project locally.

### Prerequisites

Since this a web app you need to have a web browser. 

### Installation

In this google document you can find the instruction to try the app.
https://shorturl.at/3FoLa

---


