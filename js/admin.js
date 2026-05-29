// admin.js – Controls the Admin Panel page
import { auth, db } from "./firebase-config.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  orderBy,
  limit,
  updateDoc,
  deleteDoc,
} from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";

// Utility: Redirect helper
function redirectToDashboard() {
  window.location.href = "dashboard.html";
}

// ---------- Auth & Admin Guard ----------
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    redirectToDashboard();
    return;
  }
  const userSnap = await getDoc(doc(db, "users", user.uid));
  if (!userSnap.exists() || !userSnap.data().isAdmin) {
    // Not an admin – deny access
    alert("Access denied: Admins only.");
    redirectToDashboard();
    return;
  }
  // User is admin – initialise UI
  initAdminUI();
});

// ---------- UI Initialisation ----------
function initAdminUI() {
  loadStats();
  loadUsers();
  loadActivityFeed();
  // Toggle admin role button (present on both admin and dashboard pages)
  const toggleBtn = document.getElementById("toggle-admin");
  if (toggleBtn) {
    toggleBtn.addEventListener("click", async () => {
      const currentUser = auth.currentUser;
      const userRef = doc(db, "users", currentUser.uid);
      const snap = await getDoc(userRef);
      const current = snap.data().isAdmin || false;
      await updateDoc(userRef, { isAdmin: !current });
      // Reload page to reflect change
      window.location.reload();
    });
  }
}

// ---------- Stats ----------
function loadStats() {
  // Real-time listeners for stats
  const usersCol = collection(db, "users");
  const sessCol = collection(db, "sessions");
  const reqCol = collection(db, "skillRequests");

  // Users count - real-time
  onSnapshot(usersCol, (snapshot) => {
    document.getElementById("total-users").textContent = snapshot.size;
  });

  // Sessions count - real-time
  onSnapshot(sessCol, (snapshot) => {
    document.getElementById("total-sessions").textContent = snapshot.size;
  });

  // Requests count - real-time
  onSnapshot(reqCol, (snapshot) => {
    document.getElementById("total-requests").textContent = snapshot.size;
  });
}

// ---------- User Management ----------
function loadUsers() {
  const tbody = document.querySelector("#user-table tbody");
  tbody.innerHTML = ""; // clear
  const usersCol = collection(db, "users");
  // Real‑time listener so admins see updates instantly
  onSnapshot(usersCol, (snapshot) => {
    tbody.innerHTML = "";
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${data.name || "-"}</td>
        <td>${data.email || "-"}</td>
        <td>${data.credits ?? 0}</td>
        <td>${data.isAdmin ? "Admin" : "User"}</td>
        <td>
          <button class="action-btn" data-id="${docSnap.id}" data-action="add">+5</button>
          <button class="action-btn" data-id="${docSnap.id}" data-action="deduct">-5</button>
          <button class="action-btn" data-id="${docSnap.id}" data-action="delete">🗑️</button>
        </td>`;
      tbody.appendChild(tr);
    });
    // Attach listeners after rows are added
    tbody.querySelectorAll("button.action-btn").forEach((btn) => {
      btn.addEventListener("click", handleUserAction);
    });
  });
}

async function handleUserAction(e) {
  const btn = e.currentTarget;
  const userId = btn.dataset.id;
  const action = btn.dataset.action;
  
  try {
    const userRef = doc(db, "users", userId);
    const snap = await getDoc(userRef);
    
    if (!snap.exists()) {
      alert("User not found!");
      return;
    }
    
    const data = snap.data();
    
    if (action === "add") {
      await updateDoc(userRef, { credits: (data.credits ?? 0) + 5 });
      alert(`Added 5 credits to ${data.name || data.email}`);
    } else if (action === "deduct") {
      const newVal = Math.max(0, (data.credits ?? 0) - 5);
      await updateDoc(userRef, { credits: newVal });
      alert(`Deducted 5 credits from ${data.name || data.email}`);
    } else if (action === "delete") {
      if (confirm(`Delete user ${data.email || userId}? This cannot be undone.`)) {
        await deleteDoc(userRef);
        alert("User deleted successfully");
      }
    }
  } catch (error) {
    console.error("Error performing action:", error);
    alert(`Error: ${error.message}`);
  }
}

// ---------- Activity Monitor ----------
function loadActivityFeed() {
  const feed = document.getElementById("activity-feed");
  feed.innerHTML = "Loading activity...";

  // Get current user to check admin status
  const currentUser = auth.currentUser;
  if (!currentUser) {
    feed.innerHTML = "<div class='activity-item'>Not logged in</div>";
    return;
  }

  // Listen to sessions in real-time (admin can see all)
  const sessCol = collection(db, "sessions");
  const sessQuery = query(sessCol, orderBy("createdAt", "desc"), limit(15));

  onSnapshot(
    sessQuery,
    (sessSnap) => {
      const items = [];
      sessSnap.forEach((ds) => {
        const d = ds.data();
        const time = d.createdAt?.toDate?.().toLocaleString() || "N/A";
        const teacherName = d.teacherName || "Unknown";
        const learnerName = d.learnerName || "Unknown";
        items.push(
          `<div class="activity-item">
            <strong>📚 Session</strong>: ${teacherName} → ${learnerName}<br/>
            <small>${time}</small>
          </div>`
        );
      });

      // Also listen to skill requests
      const reqCol = collection(db, "skillRequests");
      const reqQuery = query(reqCol, orderBy("createdAt", "desc"), limit(15));

      onSnapshot(
        reqQuery,
        (reqSnap) => {
          reqSnap.forEach((ds) => {
            const d = ds.data();
            const time = d.createdAt?.toDate?.().toLocaleString() || "N/A";
            const senderName = d.senderName || "Unknown";
            const skill = d.skill || "Unknown Skill";
            items.push(
              `<div class="activity-item">
                <strong>🎯 Request</strong>: ${senderName} requesting ${skill}<br/>
                <small>${time}</small>
              </div>`
            );
          });

          // Sort by time (most recent first) and render
          if (items.length === 0) {
            feed.innerHTML = "<div class='activity-item'>No recent activity</div>";
          } else {
            feed.innerHTML = items.join("");
          }
        },
        (error) => {
          console.error("Error loading requests:", error);
          feed.innerHTML += `<div class="activity-item" style="color: #f87171;">⚠️ Cannot load requests: ${error.message}</div>`;
        }
      );
    },
    (error) => {
      console.error("Error loading sessions:", error);
      feed.innerHTML = `<div class="activity-item" style="color: #f87171;">⚠️ Cannot load sessions: ${error.message}</div>`;
    }
  );
}

// End of admin.js
