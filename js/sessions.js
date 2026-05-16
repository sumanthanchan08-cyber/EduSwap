import { auth, db } from "./firebase-config.js";
import { collection, query, where, onSnapshot, getDoc, doc } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";

let unsubscribeSessions = null;

if (window.location.pathname.includes('sessions.html')) {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
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

function listenForSessions(uid) {
    // We need sessions where user is either learner or teacher. 
    // Firestore requires two separate listeners or an 'in' query. We'll use two listeners for simplicity and merge them, or simply rely on the fact that if a session exists, we should show it.
    // For simplicity, we fetch where learnerId == uid and teacherId == uid.
    
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

            html += `
                <div class="user-card" style="margin-bottom: 15px; border-left: 4px solid #667eea;">
                    <div class="user-info">
                        <h4>${partnerName}</h4>
                        <p><strong>Role:</strong> ${role}</p>
                        <p><strong>Status:</strong> ${session.status}</p>
                    </div>
                    <div class="actions" style="margin-top: 0; gap: 10px;">
                        <button class="btn btn-sm btn-secondary join-chat-btn" data-sid="${id}">💬 Chat</button>
                        <button class="btn btn-sm join-video-btn" data-sid="${id}">📹 Video Call</button>
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
