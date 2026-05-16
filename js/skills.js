import { auth, db } from "./firebase-config.js";
import { doc, setDoc, arrayUnion, arrayRemove } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";

let currentSkills = {
    teach: [],
    learn: []
};

// Listen for user data to render initial skills
window.addEventListener('userDataLoaded', (e) => {
    const data = e.detail;
    currentSkills.teach = data.skillsToTeach || [];
    currentSkills.learn = data.skillsToLearn || [];
    renderSkills();
});

function renderSkills() {
    const teachList = document.getElementById('teachList');
    const learnList = document.getElementById('learnList');

    if (teachList) {
        teachList.innerHTML = currentSkills.teach.map(skill => `
            <li class="skill-tag">
                ${skill} <button type="button" class="remove-teach" data-skill="${skill}">&times;</button>
            </li>
        `).join('');
    }

    if (learnList) {
        learnList.innerHTML = currentSkills.learn.map(skill => `
            <li class="skill-tag">
                ${skill} <button type="button" class="remove-learn" data-skill="${skill}">&times;</button>
            </li>
        `).join('');
    }

    // Attach remove listeners
    document.querySelectorAll('.remove-teach').forEach(btn => {
        btn.addEventListener('click', (e) => removeSkill('teach', e.target.getAttribute('data-skill')));
    });
    document.querySelectorAll('.remove-learn').forEach(btn => {
        btn.addEventListener('click', (e) => removeSkill('learn', e.target.getAttribute('data-skill')));
    });
}

async function addSkill(type, skill) {
    if (!auth.currentUser || !skill.trim()) return;
    
    const docRef = doc(db, "users", auth.currentUser.uid);
    const fieldName = type === 'teach' ? 'skillsToTeach' : 'skillsToLearn';

    try {
        await setDoc(docRef, {
            [fieldName]: arrayUnion(skill.trim())
        }, { merge: true });
        
        // Update local state and re-render
        currentSkills[type].push(skill.trim());
        renderSkills();
    } catch (error) {
        console.error("Error adding skill:", error);
        alert("Failed to add skill.");
    }
}

async function removeSkill(type, skill) {
    if (!auth.currentUser) return;
    
    const docRef = doc(db, "users", auth.currentUser.uid);
    const fieldName = type === 'teach' ? 'skillsToTeach' : 'skillsToLearn';

    try {
        await setDoc(docRef, {
            [fieldName]: arrayRemove(skill)
        }, { merge: true });
        
        // Update local state and re-render
        currentSkills[type] = currentSkills[type].filter(s => s !== skill);
        renderSkills();
    } catch (error) {
        console.error("Error removing skill:", error);
        alert("Failed to remove skill.");
    }
}

// Form submissions
const addTeachForm = document.getElementById('addTeachForm');
if (addTeachForm) {
    addTeachForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const input = document.getElementById('newTeachSkill');
        addSkill('teach', input.value);
        input.value = ''; // clear
    });
}

const addLearnForm = document.getElementById('addLearnForm');
if (addLearnForm) {
    addLearnForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const input = document.getElementById('newLearnSkill');
        addSkill('learn', input.value);
        input.value = ''; // clear
    });
}
