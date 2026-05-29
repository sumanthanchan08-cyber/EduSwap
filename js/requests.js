import { auth, db } from "./firebase-config.js";
import { collection, addDoc, query, where, onSnapshot, doc, updateDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";

// Listen for the custom event dispatched from dashboard.js
window.addEventListener('initiateRequest', async (e) => {
    const { targetUid } = e.detail;
    await sendRequest(targetUid);
});

// Setup real-time listeners for incoming/outgoing requests when user logs in
let unsubscribeIncoming = null;
let unsubscribeSent = null;

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";

if (window.location.pathname.includes('dashboard.html')) {
    onAuthStateChanged(auth, (user) => {
        if (user) {
            listenForIncomingRequests(user.uid);
            listenForSentRequests(user.uid);
        } else {
            if (unsubscribeIncoming) unsubscribeIncoming();
            if (unsubscribeSent) unsubscribeSent();
        }
    });
}

async function sendRequest(receiverId) {
    if (!auth.currentUser) return;
    const senderId = auth.currentUser.uid;

    try {
        // Validate credit balance
        const senderDoc = await getDoc(doc(db, "users", senderId));
        if (senderDoc.exists()) {
            const data = senderDoc.data();
            if ((data.credits || 0) < 1) {
                alert("You do not have enough credits to send a learning request. Teach others to earn credits!");
                return;
            }
        }

        await addDoc(collection(db, "skillRequests"), {
            senderId: senderId,
            receiverId: receiverId,
            status: "pending", // pending, accepted_by_receiver, confirmed, rejected
            createdAt: new Date().toISOString()
        });
        alert("Request sent successfully!");
    } catch (error) {
        console.error("Error sending request:", error);
        alert("Failed to send request.");
    }
}

function listenForIncomingRequests(uid) {
    const q = query(collection(db, "skillRequests"), where("receiverId", "==", uid));
    
    unsubscribeIncoming = onSnapshot(q, async (snapshot) => {
        const requestsList = document.getElementById('requestsList');
        if (!requestsList) return;

        if (snapshot.empty) {
            requestsList.innerHTML = '<p class="empty-text">No incoming requests.</p>';
            return;
        }

        let html = '';
        for (const change of snapshot.docs) {
            const req = change.data();
            const reqId = change.id;
            
            // We only show pending requests to the receiver
            if (req.status === 'pending') {
                const senderDoc = await getDoc(doc(db, "users", req.senderId));
                const senderName = senderDoc.exists() ? senderDoc.data().name : "Unknown User";

                html += `
                    <div class="request-card">
                        <div class="user-info">
                            <h4>${senderName}</h4>
                            <p>Sent a learning request</p>
                        </div>
                        <div class="inline-form">
                            <button class="btn btn-sm accept-btn" data-req="${reqId}">Accept</button>
                            <button class="btn btn-sm btn-secondary reject-btn" data-req="${reqId}">Reject</button>
                        </div>
                    </div>
                `;
            } else if (req.status === 'accepted_by_receiver') {
                 html += `
                    <div class="request-card">
                        <div class="user-info">
                            <h4>Request Accepted</h4>
                            <p>Waiting for the sender to confirm the session...</p>
                        </div>
                    </div>
                 `;
            } else if (req.status === 'confirmed') {
                const senderDoc = await getDoc(doc(db, "users", req.senderId));
                const senderName = senderDoc.exists() ? senderDoc.data().name : "Unknown User";

                 html += `
                    <div class="request-card" style="border-color: var(--success); box-shadow: 0 0 15px rgba(16, 185, 129, 0.1);">
                        <div class="user-info">
                            <h4>From: ${senderName}</h4>
                            <p>Status: <strong style="color: var(--success)">Session Confirmed!</strong></p>
                        </div>
                        <a href="sessions.html" class="btn btn-sm">Go to Sessions</a>
                    </div>
                 `;
            }
        }

        requestsList.innerHTML = html === '' ? '<p class="empty-text">No active incoming requests.</p>' : html;

        // Attach listeners
        document.querySelectorAll('.accept-btn').forEach(btn => {
            btn.addEventListener('click', (e) => respondToRequest(e.target.getAttribute('data-req'), 'accepted_by_receiver'));
        });
        document.querySelectorAll('.reject-btn').forEach(btn => {
            btn.addEventListener('click', (e) => respondToRequest(e.target.getAttribute('data-req'), 'rejected'));
        });
    });
}

function listenForSentRequests(uid) {
    const q = query(collection(db, "skillRequests"), where("senderId", "==", uid));
    
    unsubscribeSent = onSnapshot(q, async (snapshot) => {
        const sentRequestsList = document.getElementById('sentRequestsList');
        if (!sentRequestsList) return;

        if (snapshot.empty) {
            sentRequestsList.innerHTML = '<p class="empty-text">No sent requests.</p>';
            return;
        }

        let html = '';
        for (const change of snapshot.docs) {
            const req = change.data();
            const reqId = change.id;
            
            const receiverDoc = await getDoc(doc(db, "users", req.receiverId));
            const receiverName = receiverDoc.exists() ? receiverDoc.data().name : "Unknown User";

            if (req.status === 'pending') {
                html += `
                    <div class="request-card">
                        <div class="user-info">
                            <h4>To: ${receiverName}</h4>
                            <p>Status: <span style="color: var(--warning)">Pending...</span></p>
                        </div>
                    </div>
                `;
            } else if (req.status === 'accepted_by_receiver') {
                html += `
                    <div class="request-card" style="border-color: var(--success); background: rgba(16, 185, 129, 0.05);">
                        <div class="user-info">
                            <h4>To: ${receiverName}</h4>
                            <p>Status: <strong style="color: var(--success)">Accepted!</strong></p>
                            <p style="font-size: 0.8rem; margin-top: 5px;">Confirm to start the session.</p>
                        </div>
                        <button class="btn btn-sm confirm-session-btn" data-req="${reqId}" data-receiver="${req.receiverId}">Confirm Session</button>
                    </div>
                `;
            } else if (req.status === 'confirmed') {
                html += `
                    <div class="request-card">
                        <div class="user-info">
                            <h4>To: ${receiverName}</h4>
                            <p>Status: <strong>Session Confirmed</strong></p>
                        </div>
                        <a href="sessions.html" class="btn btn-sm btn-secondary">Go to Sessions</a>
                    </div>
                `;
            }
        }

        sentRequestsList.innerHTML = html === '' ? '<p class="empty-text">No sent requests.</p>' : html;

        // Attach listeners for confirming session
        document.querySelectorAll('.confirm-session-btn').forEach(btn => {
            btn.addEventListener('click', (e) => confirmSession(e.target.getAttribute('data-req'), e.target.getAttribute('data-receiver')));
        });
    });
}

async function respondToRequest(requestId, status) {
    try {
        const reqRef = doc(db, "skillRequests", requestId);
        await updateDoc(reqRef, { status: status });

        if (status === 'accepted_by_receiver') {
            alert("Request accepted! Waiting for sender to confirm.");
        } else {
            alert("Request rejected.");
        }
    } catch (error) {
        console.error("Error updating request:", error);
    }
}

async function confirmSession(requestId, receiverId) {
    try {
        const senderId = auth.currentUser.uid;

        // Check credits first
        const userDoc = await getDoc(doc(db, "users", senderId));
        if (userDoc.exists()) {
            const userData = userDoc.data();
            if ((userData.credits || 0) < 1) {
                alert("You do not have enough credits to confirm this session. Teach others to earn credits!");
                return;
            }
        }

        // 1. Update request status
        const reqRef = doc(db, "skillRequests", requestId);
        await updateDoc(reqRef, { status: 'confirmed' });

        // 2. Create the Session Document
        await addDoc(collection(db, "sessions"), {
            requestId: requestId,
            learnerId: senderId, // Assume sender wants to learn
            teacherId: receiverId, // Assume receiver is teaching
            status: "active",
            createdAt: new Date().toISOString()
        });

        alert("Session confirmed! You can now join the chat and video call in your Sessions dashboard.");
        window.location.href = "sessions.html";

    } catch (error) {
        console.error("Error confirming session:", error);
        alert("Failed to confirm session.");
    }
}
