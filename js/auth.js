import { auth, db } from "./firebase-config.js";
import { 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    sendPasswordResetEmail, 
    onAuthStateChanged,
    signOut,
    GoogleAuthProvider,
    signInWithPopup,
    updateProfile
} from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";

// Helper function to show errors
const showError = (groupId, message) => {
    const group = document.getElementById(groupId);
    if(group) {
        group.classList.add('error');
        const errorEl = group.querySelector('.error-message');
        if(errorEl) errorEl.textContent = message;
    }
};

const clearError = (groupId) => {
    const group = document.getElementById(groupId);
    if(group) group.classList.remove('error');
};

// --- Signup Logic ---
const signupForm = document.getElementById('signupForm');
if (signupForm) {
    signupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const name = document.getElementById('name').value;
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        
        clearError('nameGroup'); clearError('emailGroup'); clearError('passwordGroup');
        
        let isValid = true;
        if (!name.trim()) { showError('nameGroup', 'Name is required.'); isValid = false; }
        if (!email || !email.includes('@')) { showError('emailGroup', 'Please enter a valid email address.'); isValid = false; }
        if (!password || password.length < 6) { showError('passwordGroup', 'Password must be at least 6 characters long.'); isValid = false; }
        
        if (!isValid) return;

        try {
            // 1. Create user in Firebase Auth
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            // 1.5 Set display name in Firebase Auth
            await updateProfile(user, { displayName: name });

            // 2. Save user profile in Firestore
            await setDoc(doc(db, "users", user.uid), {
                uid: user.uid,
                name: name,
                email: email,
                skillsToTeach: [],
                skillsToLearn: [],
                credits: 10, // Starting bonus
                createdAt: new Date().toISOString()
            });

            alert('Account created successfully! Redirecting to dashboard...');
            window.location.href = 'dashboard.html';
        } catch (error) {
            console.error("Error signing up:", error);
            showError('emailGroup', error.message);
        }
    });
}

// --- Login Logic ---
const loginForm = document.getElementById('loginForm');
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        
        clearError('emailGroup'); clearError('passwordGroup');
        let isValid = true;
        if (!email || !email.includes('@')) { showError('emailGroup', 'Please enter a valid email address.'); isValid = false; }
        if (!password) { showError('passwordGroup', 'Password cannot be empty.'); isValid = false; }
        
        if (!isValid) return;

        try {
            await signInWithEmailAndPassword(auth, email, password);
            alert('Login successful! Redirecting to dashboard...');
            window.location.href = 'dashboard.html';
        } catch (error) {
            console.error("Error logging in:", error);
            showError('emailGroup', 'Invalid email or password.');
        }
    });
}

// --- Google Login Logic ---
const googleProvider = new GoogleAuthProvider();

const handleGoogleLogin = async (e) => {
    e.preventDefault();
    try {
        const result = await signInWithPopup(auth, googleProvider);
        const user = result.user;

        // Check if user already exists in Firestore
        const userDoc = await getDoc(doc(db, "users", user.uid));
        
        if (!userDoc.exists()) {
            // Create profile for new Google user
            await setDoc(doc(db, "users", user.uid), {
                uid: user.uid,
                name: user.displayName || "Google User",
                email: user.email,
                skillsToTeach: [],
                skillsToLearn: [],
                credits: 10,
                createdAt: new Date().toISOString()
            });
        }

        alert('Login successful! Redirecting...');
        window.location.href = 'dashboard.html';
    } catch (error) {
        console.error("Google Login Error:", error);
        alert("Failed to login with Google: " + error.message);
    }
};

const googleBtns = document.querySelectorAll('.google-login-btn');
googleBtns.forEach(btn => btn.addEventListener('click', handleGoogleLogin));

// --- Forgot Password Logic ---
const resetForm = document.getElementById('resetForm');
if (resetForm) {
    resetForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const email = document.getElementById('email').value;
        clearError('emailGroup');
        
        if (!email || !email.includes('@')) { 
            showError('emailGroup', 'Please enter a valid email address.'); 
            return;
        }

        try {
            await sendPasswordResetEmail(auth, email);
            alert('Password reset link sent! Check your email.');
            window.location.href = 'login.html';
        } catch (error) {
            console.error("Error sending reset email:", error);
            showError('emailGroup', error.message);
        }
    });
}

// --- Logout Logic ---
export const logoutUser = async () => {
    try {
        await signOut(auth);
        window.location.href = 'login.html';
    } catch (error) {
        console.error("Error logging out:", error);
    }
};

// Global logout hook if button exists
const logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) {
    logoutBtn.addEventListener('click', logoutUser);
}

// --- Auth State Observer for Protection ---
onAuthStateChanged(auth, (user) => {
    const isProtectedPage = window.location.pathname.includes('dashboard.html');
    const isAuthPage = window.location.pathname.includes('login.html') || window.location.pathname.includes('signup.html');

    if (user) {
        if (isAuthPage) {
            window.location.href = 'dashboard.html';
        }
    } else {
        if (isProtectedPage) {
            window.location.href = 'login.html';
        }
    }
});
