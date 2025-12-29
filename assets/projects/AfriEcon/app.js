// Import Firebase SDKs from CDN
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-analytics.js";
import { getDatabase, ref, get, push, set } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-database.js";

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

// DOM Elements
const evaluationForm = document.getElementById('evaluationForm');
const submitBtn = document.getElementById('submitBtn');
const refreshBtn = document.getElementById('refreshBtn');
const dataDisplay = document.getElementById('dataDisplay');
const connectionStatus = document.getElementById('connectionStatus');
const toast = document.getElementById('toast');

// Statistics
const totalEvaluationsEl = document.getElementById('totalEvaluations');
const avgRatingEl = document.getElementById('avgRating');
const totalEvaluatorsEl = document.getElementById('totalEvaluators');

function updateConnectionStatus(connected) {
  const pulseDot = document.querySelector('.pulse-dot');
  if (connected) {
    connectionStatus.textContent = 'Connected to RTDB';
    pulseDot.classList.add('connected');
  } else {
    connectionStatus.textContent = 'Disconnected';
    pulseDot.classList.remove('connected');
  }
}

function showToast(message, type = 'success') {
  toast.textContent = message;
  toast.className = `toast ${type} show`;
  setTimeout(() => toast.classList.remove('show'), 3000);
}

async function loadRecentEvaluations() {
  try {
    dataDisplay.innerHTML = '<div class="loading">Loading...</div>';
    const evalRef = ref(db, 'human_evaluations');
    const snapshot = await get(evalRef);

    if (snapshot.exists()) {
      const data = snapshot.val();
      const evaluations = Object.values(data).reverse().slice(0, 20);
      const evaluators = new Set(evaluations.map(e => e.evaluator));

      let html = '';
      evaluations.forEach(item => {
        html += `
          <div class="evaluation-item">
            <div class="evaluation-header">
              <span class="evaluator-name">${item.evaluator}</span>
              <span class="rating-badge">⭐ ${item.quality_score}/5</span>
            </div>
            <div class="evaluation-content">${item.comments || 'No comments'}</div>
          </div>`;
      });
      dataDisplay.innerHTML = html;

      totalEvaluationsEl.textContent = evaluations.length;
      totalEvaluatorsEl.textContent = evaluators.size;
      const avg = evaluations.length > 0 ? evaluations.reduce((sum, e) => sum + e.quality_score, 0) / evaluations.length : 0;
      avgRatingEl.textContent = avg.toFixed(1);
    } else {
      dataDisplay.innerHTML = '<div class="empty-state">No evaluations yet.</div>';
    }
  } catch (error) {
    console.error('Error:', error);
    dataDisplay.innerHTML = '<div class="empty-state">Load failed.</div>';
  }
}

evaluationForm.onsubmit = async (e) => {
  e.preventDefault();
  const formData = new FormData(evaluationForm);
  const data = {
    evaluator: formData.get('evaluatorName'),
    original_id: formData.get('questionId'),
    comments: formData.get('comments'),
    quality_score: parseInt(formData.get('rating')),
    timestamp: { ".sv": "timestamp" }
  };

  try {
    submitBtn.disabled = true;
    const listRef = ref(db, 'human_evaluations');
    const newRef = push(listRef);
    await set(newRef, data);
    showToast('Submitted!', 'success');
    evaluationForm.reset();
    loadRecentEvaluations();
  } catch (error) {
    showToast('Failed!', 'error');
  } finally {
    submitBtn.disabled = false;
  }
};

refreshBtn.onclick = loadRecentEvaluations;
updateConnectionStatus(true);
loadRecentEvaluations();
