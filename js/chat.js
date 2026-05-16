import { auth, db } from "./firebase-config.js";
import { collection, addDoc, query, where, onSnapshot, getDoc, doc, orderBy } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";

const urlParams = new URLSearchParams(window.location.search);
const sessionId = urlParams.get('session');

let currentSession = null;
let otherUserName = "Partner";

if (window.location.pathname.includes('chat.html')) {
    if (!sessionId) {
        alert("Invalid session.");
        window.location.href = "sessions.html";
    }

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            await initializeChat(user.uid);
        }
    });
}

async function initializeChat(uid) {
    try {
        const sessionDoc = await getDoc(doc(db, "sessions", sessionId));
        if (!sessionDoc.exists()) {
            alert("Session not found.");
            window.location.href = "sessions.html";
            return;
        }

        currentSession = sessionDoc.data();
        
        // Security check
        if (currentSession.teacherId !== uid && currentSession.learnerId !== uid) {
            alert("Unauthorized access.");
            window.location.href = "sessions.html";
            return;
        }

        // Get partner info
        const partnerId = currentSession.teacherId === uid ? currentSession.learnerId : currentSession.teacherId;
        const partnerDoc = await getDoc(doc(db, "users", partnerId));
        if (partnerDoc.exists()) {
            otherUserName = partnerDoc.data().name;
            document.getElementById('chatTitle').textContent = `Chat with ${otherUserName}`;
        }

        // Setup Video Call Button
        document.getElementById('startVideoBtn').addEventListener('click', () => {
            window.location.href = `videocall.html?session=${sessionId}`;
        });

        // Listen for messages
        listenForMessages(uid);

        // Listen for incoming video calls
        const callDocRef = doc(db, "calls", sessionId);
        onSnapshot(callDocRef, (snapshot) => {
            const data = snapshot.data();
            const btn = document.getElementById('startVideoBtn');
            if (data?.offer && !data?.answer) {
                btn.textContent = "📞 Incoming Call! Click to Join";
                btn.style.background = "#2ecc71";
                btn.style.color = "white";
            } else {
                btn.textContent = "Start Video Call";
                btn.style.background = "white";
                btn.style.color = "#667eea";
            }
        });

    } catch (error) {
        console.error("Error initializing chat:", error);
    }
}

function listenForMessages(uid) {
    const messagesBox = document.getElementById('messagesBox');
    
    const q = query(
        collection(db, "messages"), 
        where("sessionId", "==", sessionId)
    );

    onSnapshot(q, (snapshot) => {
        messagesBox.innerHTML = '';
        
        // Sort messages locally to avoid needing a Firestore composite index
        const messages = snapshot.docs.map(doc => doc.data());
        messages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        messages.forEach(data => {
            const isSentByMe = data.senderId === uid;
            
            const timeString = new Date(data.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});

            const msgDiv = document.createElement('div');
            msgDiv.className = `message ${isSentByMe ? 'sent' : 'received'}`;
            msgDiv.innerHTML = `
                ${data.text}
                <span class="message-time">${timeString}</span>
            `;
            messagesBox.appendChild(msgDiv);
        });
        
        // Auto-scroll to bottom
        messagesBox.scrollTop = messagesBox.scrollHeight;
    });
}

// Send Message Logic
const chatForm = document.getElementById('chatForm');
if (chatForm) {
    chatForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = document.getElementById('messageInput');
        const text = input.value.trim();
        if (!text || !auth.currentUser) return;

        input.value = ''; // clear immediately

        try {
            await addDoc(collection(db, "messages"), {
                sessionId: sessionId,
                senderId: auth.currentUser.uid,
                text: text,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            console.error("Error sending message:", error);
        }
    });
}
