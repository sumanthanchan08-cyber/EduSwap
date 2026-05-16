import { auth, db } from "./firebase-config.js";
import { doc, getDoc, setDoc, onSnapshot, collection, addDoc, getDocs, deleteDoc } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";

const urlParams = new URLSearchParams(window.location.search);
const sessionId = urlParams.get('session');

let localStream = null;
let remoteStream = null;
let peerConnection = null;

const servers = {
    iceServers: [
        {
            urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302']
        }
    ],
    iceCandidatePoolSize: 10,
};

const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const callStatus = document.getElementById('callStatus');

const audioBtn = document.getElementById('audioBtn');
const videoBtn = document.getElementById('videoBtn');
const callBtn = document.getElementById('callBtn');
const hangupBtn = document.getElementById('hangupBtn');
const backBtn = document.getElementById('backBtn');

if (window.location.pathname.includes('videocall.html')) {
    if (!sessionId) {
        alert("Invalid session.");
        window.location.href = "sessions.html";
    }

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            await verifySessionAccess(user.uid);
            await setupMedia();
        }
    });
}

backBtn.onclick = () => {
    hangup();
    window.location.href = `chat.html?session=${sessionId}`;
};

async function verifySessionAccess(uid) {
    const sessionDoc = await getDoc(doc(db, "sessions", sessionId));
    if (!sessionDoc.exists()) {
        alert("Session not found.");
        window.location.href = "sessions.html";
        return;
    }
    const data = sessionDoc.data();
    if (data.teacherId !== uid && data.learnerId !== uid) {
        alert("Unauthorized access.");
        window.location.href = "sessions.html";
    }
}

async function setupMedia() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideo.srcObject = localStream;
        callStatus.textContent = "Ready to connect. Click 📞 to start.";
    } catch (error) {
        console.error("Error accessing media devices.", error);
        callStatus.textContent = "Error: Camera/Mic access denied.";
    }
}

// Audio/Video Toggles
audioBtn.onclick = () => {
    const audioTrack = localStream.getAudioTracks()[0];
    if(audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        audioBtn.classList.toggle('off');
        audioBtn.textContent = audioTrack.enabled ? '🎤' : '🔇';
    }
};

videoBtn.onclick = () => {
    const videoTrack = localStream.getVideoTracks()[0];
    if(videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        videoBtn.classList.toggle('off');
        videoBtn.textContent = videoTrack.enabled ? '📷' : '🚫';
    }
};

// Start Call Logic (Creates Offer)
callBtn.onclick = async () => {
    callBtn.disabled = true;
    callStatus.textContent = "Calling...";

    peerConnection = new RTCPeerConnection(servers);
    remoteStream = new MediaStream();
    remoteVideo.srcObject = remoteStream;

    if (!localStream) {
        alert("Cannot start video call: Camera/Microphone access was denied. Please allow permissions and refresh the page.");
        callBtn.disabled = false;
        callStatus.textContent = "Error: Camera/Mic access denied.";
        return;
    }

    // Push tracks from local stream to peer connection
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

    // Pull tracks from remote stream
    peerConnection.ontrack = event => {
        event.streams[0].getTracks().forEach(track => {
            remoteStream.addTrack(track);
        });
    };

    const callDoc = doc(db, "calls", sessionId);
    const offerCandidates = collection(callDoc, "offerCandidates");
    const answerCandidates = collection(callDoc, "answerCandidates");

    // Get ICE candidates
    peerConnection.onicecandidate = event => {
        if (event.candidate) {
            addDoc(offerCandidates, event.candidate.toJSON());
        }
    };

    // Create offer
    const offerDescription = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offerDescription);

    const offer = {
        sdp: offerDescription.sdp,
        type: offerDescription.type,
    };

    try {
        await setDoc(callDoc, { offer });
    } catch (error) {
        console.error("Signaling Error:", error);
        alert("Failed to connect to the database. Did you update your Firestore Security Rules? Error: " + error.message);
        callBtn.disabled = false;
        callStatus.textContent = "Error placing call.";
        return;
    }

    // Listen for answer
    onSnapshot(callDoc, (snapshot) => {
        const data = snapshot.data();
        if (!peerConnection.currentRemoteDescription && data?.answer) {
            const answerDescription = new RTCSessionDescription(data.answer);
            peerConnection.setRemoteDescription(answerDescription);
            callStatus.textContent = "Connected!";
        }
    });

    // Listen for remote ICE candidates
    onSnapshot(answerCandidates, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            if (change.type === 'added') {
                const candidate = new RTCIceCandidate(change.doc.data());
                peerConnection.addIceCandidate(candidate);
            }
        });
    });
};

// Listen for incoming calls automatically
let incomingCallListener = null;

if (window.location.pathname.includes('videocall.html')) {
    onAuthStateChanged(auth, (user) => {
        if(user) {
            const callDoc = doc(db, "calls", sessionId);
            incomingCallListener = onSnapshot(callDoc, async (snapshot) => {
                const data = snapshot.data();
                
                // If there's an offer and we haven't created an answer yet
                if (data?.offer && !data?.answer && !peerConnection) {
                    callStatus.textContent = "Incoming call... Answering...";
                    await answerCall(data.offer);
                }
            });
        }
    });
}

async function answerCall(offerData) {
    peerConnection = new RTCPeerConnection(servers);
    remoteStream = new MediaStream();
    remoteVideo.srcObject = remoteStream;

    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

    peerConnection.ontrack = event => {
        event.streams[0].getTracks().forEach(track => {
            remoteStream.addTrack(track);
        });
    };

    const callDoc = doc(db, "calls", sessionId);
    const offerCandidates = collection(callDoc, "offerCandidates");
    const answerCandidates = collection(callDoc, "answerCandidates");

    peerConnection.onicecandidate = event => {
        if (event.candidate) {
            addDoc(answerCandidates, event.candidate.toJSON());
        }
    };

    await peerConnection.setRemoteDescription(new RTCSessionDescription(offerData));

    const answerDescription = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answerDescription);

    const answer = {
        type: answerDescription.type,
        sdp: answerDescription.sdp
    };

    await setDoc(callDoc, { answer }, { merge: true });

    onSnapshot(offerCandidates, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            if (change.type === 'added') {
                const candidate = new RTCIceCandidate(change.doc.data());
                peerConnection.addIceCandidate(candidate);
            }
        });
    });

    callStatus.textContent = "Connected!";
    callBtn.disabled = true;
}

hangupBtn.onclick = hangup;

async function hangup() {
    if (peerConnection) {
        peerConnection.close();
    }
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localVideo.srcObject = null;
    }
    if (remoteStream) {
        remoteStream.getTracks().forEach(track => track.stop());
        remoteVideo.srcObject = null;
    }

    callStatus.textContent = "Call Ended.";
    
    // Cleanup signaling data
    const callDoc = doc(db, "calls", sessionId);
    try {
        await deleteDoc(callDoc);
    } catch(e) { console.error(e); }

    // Redirect back to chat after 1.5 seconds
    setTimeout(() => {
        window.location.href = `chat.html?session=${sessionId}`;
    }, 1500);
}
