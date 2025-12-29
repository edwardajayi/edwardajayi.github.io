// Import Firebase SDKs from CDN
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-analytics.js";
import { getDatabase, ref, get } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-database.js";

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
let allData = [];
let filteredData = [];
let currentView = 'table';
let currentPage = 1;
const itemsPerPage = 50;

// DOM Elements
const loadDataBtn = document.getElementById('loadDataBtn');
const exportCSVBtn = document.getElementById('exportCSVBtn');
const exportJSONBtn = document.getElementById('exportJSONBtn');
const searchInput = document.getElementById('searchInput');
const questionTypeFilter = document.getElementById('questionTypeFilter');
const actionFilter = document.getElementById('actionFilter');
const dataContainer = document.getElementById('dataContainer');
const connectionStatus = document.getElementById('connectionStatus');
const recordCount = document.getElementById('recordCount');
const toast = document.getElementById('toast');
const detailModal = document.getElementById('detailModal');
const closeModal = document.getElementById('closeModal');
const modalBody = document.getElementById('modalBody');
const viewBtns = document.querySelectorAll('.view-btn');
const pagination = document.getElementById('pagination');
const prevPageBtn = document.getElementById('prevPageBtn');
const nextPageBtn = document.getElementById('nextPageBtn');
const pageInfo = document.getElementById('pageInfo');

// Update connection status
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

// Show toast notification
function showToast(message, type = 'success') {
    toast.textContent = message;
    toast.className = `toast ${type} show`;
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// Escape HTML
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}

// Load data from RTDB
async function loadData() {
    try {
        loadDataBtn.disabled = true;
        loadDataBtn.innerHTML = 'Loading...';

        dataContainer.innerHTML = '<div class="loading-state"><div class="loading-spinner"></div><p>Fetching data from Realtime Database...</p></div>';

        const dbRef = ref(db, '/');
        const snapshot = await get(dbRef);

        allData = [];
        if (snapshot.exists()) {
            const data = snapshot.val();
            const evaluations = data.human_evaluations || {};

            Object.keys(data).forEach((key, index) => {
                const item = data[key];
                // Process only question objects
                if (item && typeof item === 'object' && item.question && item.answer && key !== 'human_evaluations') {
                    const q_id = item.q_id !== undefined ? item.q_id : index;
                    const qEvals = evaluations[q_id] || evaluations[key] || {};

                    allData.push({
                        id: key,
                        q_id: q_id,
                        ...item,
                        evals: {
                            a1: !!qEvals['Annotator 1'],
                            a2: !!qEvals['Annotator 2'],
                            a3: !!qEvals['Annotator 3']
                        }
                    });
                }
            });
        }

        if (allData.length === 0) {
            dataContainer.innerHTML = '<div class="loading-state"><p>No data found at root. Check database structure.</p></div>';
            showToast('No data found', 'error');
            return;
        }

        populateFilters();
        filteredData = [...allData];
        displayData();

        exportCSVBtn.disabled = false;
        exportJSONBtn.disabled = false;
        recordCount.textContent = allData.length;
        showToast(`Loaded ${allData.length} records!`, 'success');
    } catch (error) {
        console.error('Error:', error);
        dataContainer.innerHTML = `<div class="loading-state"><p>Error: ${error.message}</p></div>`;
        showToast('Load failed', 'error');
    } finally {
        loadDataBtn.disabled = false;
        loadDataBtn.innerHTML = 'Load Dataset';
    }
}

// Populate filters
function populateFilters() {
    const questionTypes = new Set();
    const actions = new Set();
    allData.forEach(item => {
        if (item.question_type) questionTypes.add(item.question_type);
        if (item.action) actions.add(item.action);
    });

    questionTypeFilter.innerHTML = '<option value="">All Question Types</option>';
    [...questionTypes].sort().forEach(type => {
        questionTypeFilter.innerHTML += `<option value="${escapeHtml(type)}">${escapeHtml(type)}</option>`;
    });

    actionFilter.innerHTML = '<option value="">All Actions</option>';
    [...actions].sort().forEach(act => {
        actionFilter.innerHTML += `<option value="${escapeHtml(act)}">${escapeHtml(act)}</option>`;
    });
}

function filterData() {
    const search = searchInput.value.toLowerCase();
    const type = questionTypeFilter.value;
    const act = actionFilter.value;

    filteredData = allData.filter(item => {
        const matchesSearch = !search || Object.values(item).some(v => String(v).toLowerCase().includes(search));
        const matchesType = !type || item.question_type === type;
        const matchesAct = !act || item.action === act;
        return matchesSearch && matchesType && matchesAct;
    });

    currentPage = 1;
    displayData();
    recordCount.textContent = filteredData.length;
}

function displayData() {
    if (filteredData.length === 0) {
        dataContainer.innerHTML = '<div class="loading-state"><p>No matching records.</p></div>';
        pagination.style.display = 'none';
        return;
    }

    const totalPages = Math.ceil(filteredData.length / itemsPerPage);
    const pageData = filteredData.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    if (currentView === 'table') displayTableView(pageData);
    else displayCardsView(pageData);

    updatePagination(totalPages);
}

function displayTableView(data) {
    const fields = ['question', 'answer', 'question_type'];
    const statusFields = ['a1', 'a2', 'a3'];

    let html = '<table class="data-table"><thead><tr>';
    fields.forEach(f => html += `<th>${f.toUpperCase().replace('_', ' ')}</th>`);
    statusFields.forEach(f => html += `<th class="status-col">${f.toUpperCase()}</th>`);
    html += '<th>ACTION</th></tr></thead><tbody>';

    data.forEach(item => {
        html += `<tr onclick="showDetail(${allData.indexOf(item)})">`;
        fields.forEach(f => {
            const val = item[f] || '';
            html += `<td>${escapeHtml(String(val).substring(0, 50))}${String(val).length > 50 ? '...' : ''}</td>`;
        });

        statusFields.forEach(f => {
            const done = item.evals[f];
            html += `<td class="status-col">${done ? '<span class="status-dot done" title="Reviewed">✓</span>' : '<span class="status-dot todo" title="Pending">○</span>'}</td>`;
        });

        html += `<td><a href="evaluate.html?id=${item.q_id}" class="eval-link" onclick="event.stopPropagation()">Evaluate</a></td>`;
        html += '</tr>';
    });
    html += '</tbody></table>';
    dataContainer.innerHTML = html;
}

function displayCardsView(data) {
    let html = '<div class="cards-grid">';
    data.forEach(item => {
        html += `
      <div class="data-card" onclick="showDetail(${allData.indexOf(item)})">
        <div class="card-status-bar">
            <span class="status-mini ${item.evals.a1 ? 'done' : ''}">A1</span>
            <span class="status-mini ${item.evals.a2 ? 'done' : ''}">A2</span>
            <span class="status-mini ${item.evals.a3 ? 'done' : ''}">A3</span>
        </div>
        <div class="data-card-label">Question</div>
        <div class="data-card-value">${escapeHtml(item.question)}</div>
        <div class="data-card-label">Type</div>
        <div class="data-card-value">${escapeHtml(item.question_type)}</div>
        <div class="card-actions">
            <a href="evaluate.html?id=${item.q_id}" class="eval-link-btn" onclick="event.stopPropagation()">Evaluate Record</a>
        </div>
      </div>`;
    });
    html += '</div>';
    dataContainer.innerHTML = html;
}

window.showDetail = function (idx) {
    const item = allData[idx];
    let html = `
        <div class="detail-actions">
            <a href="evaluate.html?id=${item.q_id}" class="btn btn-primary">
                Evaluate this record
            </a>
        </div>
    `;
    Object.keys(item).forEach(f => {
        if (f === 'evals') return;
        html += `
      <div class="detail-field">
        <div class="detail-label">${f}</div>
        <div class="detail-value">${escapeHtml(item[f])}</div>
      </div>`;
    });
    modalBody.innerHTML = html;
    detailModal.classList.add('show');
};

closeModal.onclick = () => detailModal.classList.remove('show');
window.onclick = (e) => { if (e.target === detailModal) detailModal.classList.remove('show'); };

function updatePagination(totalPages) {
    pagination.style.display = totalPages > 1 ? 'flex' : 'none';
    pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
    prevPageBtn.disabled = currentPage === 1;
    nextPageBtn.disabled = currentPage === totalPages;
}

prevPageBtn.onclick = () => { if (currentPage > 1) { currentPage--; displayData(); } };
nextPageBtn.onclick = () => { if (currentPage < Math.ceil(filteredData.length / itemsPerPage)) { currentPage++; displayData(); } };

viewBtns.forEach(btn => btn.onclick = () => {
    viewBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentView = btn.dataset.view;
    displayData();
});

loadDataBtn.onclick = loadData;
searchInput.oninput = filterData;
questionTypeFilter.onchange = filterData;
actionFilter.onchange = filterData;

updateConnectionStatus(true);
