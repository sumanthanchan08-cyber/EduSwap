import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { 
    doc, 
    getDoc, 
    setDoc, 
    collection, 
    getDocs, 
    updateDoc, 
    increment, 
    query, 
    where 
} from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";

let currentUserData = null;

// Ensure we are only running this on the dashboard
if (window.location.pathname.includes('dashboard.html')) {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            await claimUnclaimedCredits(user.uid);
            await loadUserProfile(user.uid);
            await loadOtherUsers(user.uid);
        }
    });
}

async function claimUnclaimedCredits(uid) {
    try {
        const q = query(collection(db, "sessions"), where("teacherId", "==", uid));
        const snapshot = await getDocs(q);
        if (snapshot.empty) return;

        let claimedCount = 0;
        for (const sessionDoc of snapshot.docs) {
            const sessionData = sessionDoc.data();
            if (sessionData.status === "completed" && sessionData.teacherClaimedCredit !== true) {
                // Claim credit
                await updateDoc(doc(db, "sessions", sessionDoc.id), {
                    teacherClaimedCredit: true
                });
                // Increment teacher's credits
                await updateDoc(doc(db, "users", uid), {
                    credits: increment(1)
                });
                claimedCount++;
            }
        }

        if (claimedCount > 0) {
            alert(`Congratulations! You earned ${claimedCount} time credit(s) for teaching a session!`);
        }
    } catch (error) {
        console.error("Error auto-claiming credits:", error);
    }
}


async function loadUserProfile(uid) {
    try {
        const docRef = doc(db, "users", uid);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            currentUserData = docSnap.data();
        } else {
            console.log("No such document! Creating default profile...");
            
            let fallbackName = auth.currentUser.displayName;
            if (!fallbackName || fallbackName === "Unknown User") {
                fallbackName = prompt("Please enter your name for your profile:") || "Student";
                
                // Try to update auth profile as well
                try {
                    const { updateProfile } = await import("https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js");
                    await updateProfile(auth.currentUser, { displayName: fallbackName });
                } catch(e) {}
            }

            const defaultData = {
                uid: uid,
                name: fallbackName,
                email: auth.currentUser.email,
                skillsToTeach: [],
                skillsToLearn: [],
                credits: 10,
                createdAt: new Date().toISOString()
            };
            await setDoc(docRef, defaultData);
            currentUserData = defaultData;
        }

        // Update UI
        document.getElementById('welcomeMessage').textContent = `Welcome, ${currentUserData.name}!`;
        document.getElementById('userCredits').textContent = `Credits: ${currentUserData.credits}`;
        
        // Trigger an event so skills.js can render the initial lists
        const event = new CustomEvent('userDataLoaded', { detail: currentUserData });
        window.dispatchEvent(event);
    } catch (error) {
        console.error("Error loading profile:", error);
    }
}

async function loadOtherUsers(currentUid) {
    const usersList = document.getElementById('usersList');
    usersList.innerHTML = '<p class="loading-text">Loading users...</p>';
    
    try {
        const querySnapshot = await getDocs(collection(db, "users"));
        let usersHtml = '';
        
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            // Don't show the current user in the partner list
            if (data.uid !== currentUid) {
                // Formatting skills
                const teachSkills = data.skillsToTeach && data.skillsToTeach.length > 0 ? data.skillsToTeach.join(', ') : 'None listed';
                const learnSkills = data.skillsToLearn && data.skillsToLearn.length > 0 ? data.skillsToLearn.join(', ') : 'None listed';
                
                usersHtml += `
                    <div class="user-card">
                        <div class="user-info">
                            <h4>${data.name}</h4>
                            <p><strong>Can Teach:</strong> ${teachSkills}</p>
                            <p><strong>Wants to Learn:</strong> ${learnSkills}</p>
                        </div>
                        <button class="btn btn-sm request-btn" data-uid="${data.uid}">Request</button>
                    </div>
                `;
            }
        });
        
        if (usersHtml === '') {
            usersList.innerHTML = '<p class="empty-text">No other users found yet.</p>';
        } else {
            usersList.innerHTML = usersHtml;
            // Attach event listeners for request buttons
            document.querySelectorAll('.request-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const targetUid = e.target.getAttribute('data-uid');
                    // We will dispatch an event to be handled by requests.js
                    const reqEvent = new CustomEvent('initiateRequest', { detail: { targetUid } });
                    window.dispatchEvent(reqEvent);
                });
            });
        }
    } catch (error) {
        console.error("Error loading users:", error);
        usersList.innerHTML = '<p class="error-message">Error loading users.</p>';
    }
}
