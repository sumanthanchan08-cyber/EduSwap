import { auth, db } from "./firebase-config.js";
import { 
    collection, 
    query, 
    where, 
    onSnapshot, 
    getDoc, 
    doc, 
    updateDoc, 
    increment, 
    getDocs 
} from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";

let unsubscribeSessions = null;

if (window.location.pathname.includes('sessions.html')) {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            // Auto-claim any unclaimed teaching credits first
            await claimUnclaimedCredits(user.uid);
            
            // Fetch credits
            const userDoc = await getDoc(doc(db, "users", user.uid));
            if (userDoc.exists()) {
                document.getElementById('userCredits').textContent = `Credits: ${userDoc.data().credits}`;
            }
            listenForSessions(user.uid);
        } else if (unsubscribeSessions) {
            unsubscribeSessions();
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
                // Update session first
                await updateDoc(doc(db, "sessions", sessionDoc.id), {
                    teacherClaimedCredit: true
                });
                
                // Add credit to teacher
                await updateDoc(doc(db, "users", uid), {
                    credits: increment(1)
                });
                
                claimedCount++;
            }
        }

        if (claimedCount > 0) {
            alert(`Congratulations! You earned ${claimedCount} time credit(s) for teaching a session!`);
            // Update UI credits
            const userDoc = await getDoc(doc(db, "users", uid));
            if (userDoc.exists()) {
                const creditsEl = document.getElementById('userCredits');
                if (creditsEl) {
                    creditsEl.textContent = `Credits: ${userDoc.data().credits}`;
                }
            }
        }
    } catch (error) {
        console.error("Error auto-claiming credits:", error);
    }
}

async function completeSession(sessionId) {
    try {
        const sessionRef = doc(db, "sessions", sessionId);
        const sessionSnap = await getDoc(sessionRef);
        if (!sessionSnap.exists()) return;
        const session = sessionSnap.data();

        if (session.status === 'completed') {
            alert("This session is already completed.");
            return;
        }

        // Deduct 1 credit from the learner (current user)
        const learnerId = auth.currentUser.uid;
        const learnerRef = doc(db, "users", learnerId);
        const learnerSnap = await getDoc(learnerRef);

        if (learnerSnap.exists()) {
            const learnerData = learnerSnap.data();
            const currentCredits = learnerData.credits || 0;
            if (currentCredits < 1) {
                alert("You do not have enough credits to complete this session. Please teach others to earn credits first!");
                return;
            }

            // Decrement learner's credits
            await updateDoc(learnerRef, {
                credits: increment(-1)
            });
        }

        // Update session document
        await updateDoc(sessionRef, {
            status: "completed",
            learnerPaidCredit: true
        });

        alert("Session completed successfully! 1 credit has been deducted from your balance.");
        
        // Refresh local credits display
        const updatedLearnerSnap = await getDoc(learnerRef);
        if (updatedLearnerSnap.exists()) {
            const creditsEl = document.getElementById('userCredits');
            if (creditsEl) {
                creditsEl.textContent = `Credits: ${updatedLearnerSnap.data().credits}`;
            }
        }
    } catch (error) {
        console.error("Error completing session:", error);
        alert("Failed to complete session: " + error.message);
    }
}

function listenForSessions(uid) {
    const sessionsList = document.getElementById('sessionsList');
    
    const learnerQuery = query(collection(db, "sessions"), where("learnerId", "==", uid));
    const teacherQuery = query(collection(db, "sessions"), where("teacherId", "==", uid));

    let allSessions = new Map();

    const render = async () => {
        if (allSessions.size === 0) {
            sessionsList.innerHTML = '<p class="empty-text">No active sessions found.</p>';
            return;
        }

        let html = '';
        for (const [id, session] of allSessions) {
            const isTeacher = session.teacherId === uid;
            const partnerId = isTeacher ? session.learnerId : session.teacherId;
            const role = isTeacher ? "Teaching" : "Learning";
            
            const partnerDoc = await getDoc(doc(db, "users", partnerId));
            const partnerName = partnerDoc.exists() ? partnerDoc.data().name : "Unknown Partner";

            const isCompleted = session.status === 'completed';
            let actionButtons = '';
            let cardStyle = `margin-bottom: 15px; border-left: 4px solid var(--accent-primary);`;

            if (isCompleted) {
                cardStyle = `margin-bottom: 15px; border-left: 4px solid var(--success);`;
                actionButtons = `
                    <span style="color: var(--success); font-weight: 600; font-size: 0.95rem; display: flex; align-items: center; gap: 5px;">✓ Completed & Paid</span>
                `;
            } else {
                actionButtons = `
                    <button class="btn btn-sm btn-secondary join-chat-btn" data-sid="${id}">💬 Chat</button>
                    <button class="btn btn-sm join-video-btn" data-sid="${id}">📹 Video Call</button>
                `;
                if (!isTeacher) {
                    // Learner can complete the session
                    actionButtons += `
                        <button class="btn btn-sm complete-session-btn" style="background: var(--accent-teal); box-shadow: 0 4px 12px var(--accent-teal-glow);" data-sid="${id}">✓ Complete & Pay</button>
                    `;
                }
            }

            html += `
                <div class="user-card" style="${cardStyle}">
                    <div class="user-info">
                        <h4>${partnerName}</h4>
                        <p><strong>Role:</strong> ${role}</p>
                        <p><strong>Status:</strong> <span style="text-transform: capitalize; font-weight: 600; color: ${isCompleted ? 'var(--success)' : 'var(--accent-primary)'}">${session.status}</span></p>
                    </div>
                    <div class="actions" style="margin-top: 0; gap: 10px; align-items: center;">
                        ${actionButtons}
                    </div>
                </div>
            `;
        }
        sessionsList.innerHTML = html;

        document.querySelectorAll('.join-chat-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                window.location.href = `chat.html?session=${e.target.getAttribute('data-sid')}`;
            });
        });

        document.querySelectorAll('.join-video-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                window.location.href = `videocall.html?session=${e.target.getAttribute('data-sid')}`;
            });
        });

        document.querySelectorAll('.complete-session-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const sid = e.target.getAttribute('data-sid');
                if (confirm("Are you sure you want to mark this session as completed? This will deduct 1 credit and transfer it to the teacher.")) {
                    completeSession(sid);
                }
            });
        });
    };

    onSnapshot(learnerQuery, (snapshot) => {
        snapshot.docs.forEach(doc => allSessions.set(doc.id, doc.data()));
        render();
    });

    onSnapshot(teacherQuery, (snapshot) => {
        snapshot.docs.forEach(doc => allSessions.set(doc.id, doc.data()));
        render();
    });
}
