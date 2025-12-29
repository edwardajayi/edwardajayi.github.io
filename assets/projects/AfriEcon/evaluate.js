// Import Firebase SDKs from CDN for browser compatibility
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-analytics.js";
import { getDatabase, ref, get, set, push, onValue, remove, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-database.js";

// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyDo7gvaWe1FZFI8w0bEv_RpuJNujUgaZK4",
    authDomain: "afrieconqa.firebaseapp.com",
    databaseURL: "https://afrieconqa-default-rtdb.firebaseio.com",
    projectId: "afrieconqa",
    storageBucket: "afrieconqa.firebasestorage.app",
    messagingSenderId: "430064745784",
    appId: "1:430064745784:web:10eb36bd711ec35f5255cd",
    measurementId: "G-YY30CQK0BM"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db = getDatabase(app);

// Global state
let allQuestions = [];
let completedIds = new Set();
let currentIndex = 0;
let sessionCount = 0;
let clientId = localStorage.getItem('afriecon_client_id');

if (!clientId) {
    clientId = 'client_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('afriecon_client_id', clientId);
}

// DOM Elements
const questionId = document.getElementById('questionId');
const questionText = document.getElementById('questionText');
const answerText = document.getElementById('answerText');
const evidenceText = document.getElementById('evidenceText');
const sourceUrl = document.getElementById('sourceUrl');
const commentBox = document.getElementById('commentBox');
const evaluatorNameInput = document.getElementById('evaluatorName');
const saveNextBtn = document.getElementById('saveNextBtn');
const skipBtn = document.getElementById('skipBtn');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const sessionCountEl = document.getElementById('sessionCount');
const remainingCountEl = document.getElementById('remainingCount');
const statusText = document.getElementById('statusText');
const connectionStatus = document.getElementById('connectionStatus');
const toast = document.getElementById('toast');
const syncBtn = document.getElementById('syncBtn');

// Show toast notification
function showToast(message, type = 'success') {
    toast.textContent = message;
    toast.className = `toast ${type} show`;
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// Persist evaluator name
evaluatorNameInput.addEventListener('change', async (e) => {
    const selectedRole = e.target.value;
    if (!selectedRole) return;

    try {
        // Attempt to claim role
        const claimRef = ref(db, `role_claims/${selectedRole}`);
        const snapshot = await get(claimRef);

        if (snapshot.exists() && snapshot.val() !== clientId) {
            showToast(`${selectedRole} is already claimed by another user.`, 'error');
            evaluatorNameInput.value = localStorage.getItem('evaluatorName') || "";
            return;
        }

        // Successfully claimed or already owned
        await set(claimRef, clientId);
        localStorage.setItem('evaluatorName', selectedRole);
        showToast(`Role secured: ${selectedRole}`, 'success');

        loadQuestions(); // Re-sync immediately
        validateForm();
        updateRoleUI();
    } catch (error) {
        console.error("Claim Error:", error);
        showToast("Failed to secure role.", "error");
    }
});

// Load persistent name
const savedName = localStorage.getItem('evaluatorName');
if (savedName) evaluatorNameInput.value = savedName;

// Role Claim Listener
function initRoleSync() {
    const claimsRef = ref(db, 'role_claims');
    onValue(claimsRef, (snapshot) => {
        const claims = snapshot.val() || {};
        const options = evaluatorNameInput.options;

        for (let i = 0; i < options.length; i++) {
            const role = options[i].value;
            if (!role) continue;

            const claimerId = claims[role];
            if (claimerId && claimerId !== clientId) {
                options[i].disabled = true;
                options[i].text = `${role} (Claimed)`;
            } else {
                options[i].disabled = false;
                options[i].text = role;
            }
        }
        updateRoleUI();
    });
}

function updateRoleUI() {
    const currentRole = evaluatorNameInput.value;
    if (currentRole) {
        evaluatorNameInput.classList.add('locked');
        // Add a release button if not already there
        if (!document.getElementById('releaseRoleBtn')) {
            const releaseBtn = document.createElement('button');
            releaseBtn.id = 'releaseRoleBtn';
            releaseBtn.className = 'btn-text-link';
            releaseBtn.style.color = 'var(--brand-danger)';
            releaseBtn.style.marginTop = '0.5rem';
            releaseBtn.style.display = 'block';
            releaseBtn.textContent = 'Release Role (Reset)';
            releaseBtn.onclick = releaseRole;
            evaluatorNameInput.closest('.evaluator-card').appendChild(releaseBtn);
        }
    } else {
        evaluatorNameInput.classList.remove('locked');
        const btn = document.getElementById('releaseRoleBtn');
        if (btn) btn.remove();
    }
}

async function releaseRole() {
    const currentRole = evaluatorNameInput.value;
    if (!currentRole) return;

    if (confirm(`Release control of ${currentRole}?`)) {
        try {
            await remove(ref(db, `role_claims/${currentRole}`));
            localStorage.removeItem('evaluatorName');
            evaluatorNameInput.value = "";
            showToast(`Released ${currentRole}`, 'success');
            updateRoleUI();
            location.reload(); // Refresh to clean state
        } catch (error) {
            showToast("Failed to release role.", "error");
        }
    }
}

// Load questions and existing evaluations from Realtime Database
async function loadQuestions() {
    try {
        statusText.textContent = 'Syncing...';
        connectionStatus.classList.remove('online', 'offline');

        const currentEvaluator = evaluatorNameInput.value.trim();
        console.log(`[Sync] Loading for evaluator: "${currentEvaluator}"`);

        const rootRef = ref(db, '/');
        const rootSnapshot = await get(rootRef);

        if (!rootSnapshot.exists()) {
            statusText.textContent = 'No Data';
            showToast('Database is empty', 'error');
            return;
        }

        const data = rootSnapshot.val();
        const rawQuestions = [];

        // 3. Separate questions from evaluations
        Object.keys(data).forEach((key, index) => {
            const item = data[key];
            // Identify questions strictly, use index if q_id is missing
            if (item && typeof item === 'object' && item.question && item.answer && key !== 'human_evaluations') {
                const q_id = item.q_id !== undefined ? item.q_id : index;
                rawQuestions.push({ ...item, id: key.toString(), q_id: q_id });
            }
        });

        console.log(`[Sync] Found ${rawQuestions.length} total questions in database.`);

        // 4. Identify already completed items for THIS evaluator
        completedIds.clear();
        if (data.human_evaluations) {
            Object.keys(data.human_evaluations).forEach(qIdOrIndex => {
                const evaluationsForQuestion = data.human_evaluations[qIdOrIndex];
                // Check if the current evaluator has a record under this question ID/Index
                if (evaluationsForQuestion && evaluationsForQuestion[currentEvaluator]) {
                    completedIds.add(qIdOrIndex.toString());
                }
            });
            console.log(`[Sync] Evaluator "${currentEvaluator}" has already done ${completedIds.size} items.`);
        }

        // 5. Filter for remaining items based on q_id or id
        allQuestions = rawQuestions.filter(q => !completedIds.has(q.q_id.toString()) && !completedIds.has(q.id));
        console.log(`[Sync] ${allQuestions.length} items remaining to be assessed.`);

        if (allQuestions.length === 0 && rawQuestions.length > 0) {
            statusText.textContent = 'Completed!';
            showToast('All items evaluated!', 'success');
            remainingCountEl.textContent = '0';
            updateProgress(rawQuestions.length);
            // Don't return early, still update UI
        } else {
            // 6. Handle deep links
            const urlParams = new URLSearchParams(window.location.search);
            const linkedId = urlParams.get('id');

            if (linkedId) {
                const linkedQ = rawQuestions.find(q => q.q_id.toString() === linkedId || q.id === linkedId);
                if (linkedQ) {
                    allQuestions = [linkedQ, ...allQuestions.filter(q => q.q_id.toString() !== linkedId && q.id !== linkedId)];
                    showToast(`Loaded Question ${linkedId}`, 'success');
                }
            } else {
                allQuestions = shuffleArray(allQuestions);
            }

            remainingCountEl.textContent = allQuestions.length;
            connectionStatus.classList.add('online');
            statusText.textContent = 'Online';
        }

        currentIndex = 0; // Reset index
        displayCurrentQuestion(rawQuestions.length);
    } catch (error) {
        console.error('[Sync] Error:', error);
        statusText.textContent = 'Error';
        connectionStatus.classList.add('offline');
        showToast(`Sync failed: ${error.message}`, 'error');
    }
}

// Shuffle array
function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

// Display current question
function displayCurrentQuestion(totalPossible) {
    if (currentIndex >= allQuestions.length) {
        showToast('Set finished!', 'success');
        return;
    }

    const question = allQuestions[currentIndex];

    questionId.textContent = question.question_type || `ITEM-${question.id}`;
    questionText.textContent = question.question || 'N/A';
    answerText.textContent = question.answer || 'N/A';
    evidenceText.textContent = question.evidence || 'N/A';

    if (question.url) {
        sourceUrl.href = question.url;
        sourceUrl.style.display = 'inline-flex';
    } else {
        sourceUrl.style.display = 'none';
    }

    // Reset form
    document.querySelectorAll('input[type="radio"]').forEach(input => input.checked = false);
    commentBox.value = '';
    validateForm();
    updateProgress(totalPossible);
}

// UI Validation: Require Name, Factuality, and Quality
function validateForm() {
    const factualityChecked = document.querySelector('input[name="factuality"]:checked');
    const qualityChecked = document.querySelector('input[name="quality"]:checked');
    const nameEntered = evaluatorNameInput.value.trim().length > 0;

    saveNextBtn.disabled = !(factualityChecked && qualityChecked && nameEntered);
}

// Form Listeners
document.addEventListener('change', (e) => {
    if (e.target.name === 'factuality' || e.target.name === 'quality') validateForm();
});

// Quick Tags Logic
document.querySelectorAll('.tag-chip').forEach(btn => {
    btn.addEventListener('click', () => {
        const tag = btn.getAttribute('data-tag');
        const currentText = commentBox.value;
        if (!currentText.includes(tag)) {
            commentBox.value = (currentText + ' ' + tag).trim();
        }
    });
});

// Update progress UI
function updateProgress(totalCount) {
    const total = totalCount || (allQuestions.length + completedIds.size);
    const progress = total > 0 ? (completedIds.size / total) * 100 : 0;
    progressFill.style.width = `${progress}%`;
    progressText.textContent = `${Math.round(progress)}% (${completedIds.size} / ${total})`;
    sessionCountEl.textContent = sessionCount;
    remainingCountEl.textContent = allQuestions.length - currentIndex;
}

// Save evaluation to RTDB
async function saveEvaluation() {
    const factualityInput = document.querySelector('input[name="factuality"]:checked');
    const qualityInput = document.querySelector('input[name="quality"]:checked');
    const evaluatorName = evaluatorNameInput.value.trim();

    const currentQuestion = allQuestions[currentIndex];
    if (!currentQuestion) {
        showToast('No item selected for assessment', 'error');
        return;
    }

    // Build unique persistence object
    const evaluation = {
        q_id: currentQuestion.q_id,
        original_db_key: currentQuestion.id,
        item_question: currentQuestion.question,
        factuality: factualityInput.value,
        quality_score: parseInt(qualityInput.value),
        comments: commentBox.value.trim(),
        timestamp: { ".sv": "timestamp" },
        evaluator: evaluatorName
    };

    try {
        saveNextBtn.disabled = true;
        saveNextBtn.innerHTML = '<span>Saving...</span>';

        // Save under: human_evaluations / [q_id] / [EvaluatorRole]
        const evalRef = ref(db, `human_evaluations/${currentQuestion.q_id}/${evaluatorName}`);
        await set(evalRef, evaluation);

        showToast('Assessment Submitted', 'success');

        completedIds.add(currentQuestion.id.toString());
        sessionCount++;
        currentIndex++;

        // Keep total count stable based on initial data load
        const totalPossible = allQuestions.length + completedIds.size - currentIndex;
        displayCurrentQuestion(totalPossible);

    } catch (error) {
        console.error('Error saving:', error);
        showToast(`Submission failed: ${error.message}`, 'error');
        validateForm();
    } finally {
        saveNextBtn.innerHTML = `
            <span>Save & Continue</span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <polyline points="9 18 15 12 9 6"/>
            </svg>
        `;
    }
}

// Skip item
function skipQuestion() {
    currentIndex++;
    displayCurrentQuestion();
    showToast('Item Skipped', 'success');
}

// Listeners
saveNextBtn.addEventListener('click', saveEvaluation);
skipBtn.addEventListener('click', skipQuestion);
syncBtn.addEventListener('click', loadQuestions);

// Global Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    // Submit on Ctrl+Enter
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        if (!saveNextBtn.disabled) saveEvaluation();
    }

    // Select quality scale 1-5 using number keys
    if (e.key >= '1' && e.key <= '5' && document.activeElement.tagName !== 'TEXTAREA' && document.activeElement.tagName !== 'INPUT') {
        const radio = document.querySelector(`input[name="quality"][value="${e.key}"]`);
        if (radio) {
            radio.checked = true;
            validateForm();
        }
    }
});

// Initialization
loadQuestions();
initRoleSync();
