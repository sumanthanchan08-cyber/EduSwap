import { initializeApp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";

// TODO: Replace with your actual Firebase config object from the Firebase Console
const firebaseConfig = {
    apiKey: "AIzaSyAJ-CvhCVDdYBkGC4iXlCg348akU55wjjU",
    authDomain: "eduswap-9fa56.firebaseapp.com",
    projectId: "eduswap-9fa56",
    storageBucket: "eduswap-9fa56.firebasestorage.app",
    messagingSenderId: "515280223463",
    appId: "1:515280223463:web:e020097c918a0b8af07642"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase Authentication and get a reference to the service
export const auth = getAuth(app);

// Initialize Cloud Firestore and get a reference to the service
export const db = getFirestore(app);
