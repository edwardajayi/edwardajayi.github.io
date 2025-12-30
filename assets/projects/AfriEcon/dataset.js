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
const viewResultsBtn = document.getElementById('viewResultsBtn');
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
                            a1: !!qEvals['Annotator 1'],
                            a2: !!qEvals['Annotator 2'],
                            a3: !!qEvals['Annotator 3']
                        },
                        evalDetails: qEvals
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
        viewResultsBtn.disabled = false;
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

function viewResults() {
    // Filter for records that have at least one evaluation
    const evaluatedRecords = allData.filter(item =>
        item.evalDetails && Object.keys(item.evalDetails).length > 0
    );

    if (evaluatedRecords.length === 0) {
        showToast('No evaluations found yet', 'info');
        return;
    }

    // --- Statistics Calculation ---
    const annotators = ['Annotator 1', 'Annotator 2', 'Annotator 3'];

    // 1. Factuality Counts (Grounded vs Hallucination)
    const factualityStats = {
        'Annotator 1': { yes: 0, no: 0 },
        'Annotator 2': { yes: 0, no: 0 },
        'Annotator 3': { yes: 0, no: 0 }
    };

    // 2. Average Quality Score
    const qualityStats = {
        'Annotator 1': { sum: 0, count: 0 },
        'Annotator 2': { sum: 0, count: 0 },
        'Annotator 3': { sum: 0, count: 0 }
    };

    evaluatedRecords.forEach(item => {
        const evals = item.evalDetails;
        Object.keys(evals).forEach(annotator => {
            const entry = evals[annotator];
            // Ensure we are processing the evaluation object
            if (entry && typeof entry === 'object') {
                // Factuality
                if (entry.factuality === 'yes') factualityStats[annotator].yes++;
                if (entry.factuality === 'no') factualityStats[annotator].no++;

                // Quality Score
                if (entry.quality_score) {
                    qualityStats[annotator].sum += parseInt(entry.quality_score);
                    qualityStats[annotator].count++;
                }
            }
        });
    });

    // Prepare Chart Data Arrays
    const groundedData = annotators.map(a => factualityStats[a].yes);
    const hallucinationData = annotators.map(a => factualityStats[a].no);
    const avgQualityData = annotators.map(a => {
        const s = qualityStats[a];
        return s.count > 0 ? (s.sum / s.count).toFixed(2) : 0;
    });


    // --- UI Rendering ---

    let html = `
        <div class="results-dashboard">
            <div class="dashboard-header" style="text-align: center; margin-bottom: 25px;">
                <h3>Evaluation Analytics</h3>
                <p class="subtitle" style="color: #666;">Analysis of ${evaluatedRecords.length} evaluated records</p>
            </div>
            
            <div class="charts-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                <!-- Chart 1: Grounded vs Hallucination -->
                <div class="chart-container" style="background: white; padding: 20px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); border: 1px solid #f0f0f0;">
                    <h4 style="margin-bottom: 15px; color: #333; font-size: 0.95rem; text-transform: uppercase; letter-spacing: 0.5px;">Factuality Check</h4>
                    <canvas id="factualityChart"></canvas>
                </div>
                
                <!-- Chart 2: Average Quality -->
                <div class="chart-container" style="background: white; padding: 20px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); border: 1px solid #f0f0f0;">
                    <h4 style="margin-bottom: 15px; color: #333; font-size: 0.95rem; text-transform: uppercase; letter-spacing: 0.5px;">Average Quality Rating (1-5)</h4>
                    <canvas id="qualityChart"></canvas>
                </div>
            </div>

            <div class="modal-footer" style="margin-top: 25px; text-align: right; padding-top: 15px; border-top: 1px solid #eee;">
                <button class="btn btn-secondary" onclick="document.getElementById('detailModal').classList.remove('show')">Close Reports</button>
            </div>
        </div>
    `;

    // Make modal wider for charts
    const modalContent = document.querySelector('.modal-content');
    modalContent.style.maxWidth = '1000px';

    modalBody.innerHTML = html;
    detailModal.classList.add('show');

    // --- Chart Rendering ---

    // 1. Factuality Chart (Stacked or Grouped Bar)
    new Chart(document.getElementById('factualityChart'), {
        type: 'bar',
        data: {
            labels: annotators,
            datasets: [
                {
                    label: 'Grounded (Yes)',
                    data: groundedData,
                    backgroundColor: '#10B981', // Emerald 500
                    borderRadius: 4
                },
                {
                    label: 'Hallucination (No)',
                    data: hallucinationData,
                    backgroundColor: '#EF4444', // Red 500
                    borderRadius: 4
                }
            ]
        },
        options: {
            responsive: true,
            scales: {
                x: { stacked: true },
                y: { stacked: true, beginAtZero: true }
            },
            plugins: {
                legend: { position: 'bottom' }
            }
        }
    });

    // 2. Quality Score Chart (Bar)
    new Chart(document.getElementById('qualityChart'), {
        type: 'bar',
        data: {
            labels: annotators,
            datasets: [{
                label: 'Avg Rating',
                data: avgQualityData,
                backgroundColor: '#4F46E5', // Indigo 600
                borderRadius: 4,
                barPercentage: 0.6
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: {
                    beginAtZero: true,
                    max: 5,
                    ticks: { stepSize: 1 }
                }
            },
            plugins: {
                legend: { display: false }
            }
        }
    });
}

viewResultsBtn.onclick = viewResults;

loadDataBtn.onclick = loadData;
searchInput.oninput = filterData;
questionTypeFilter.onchange = filterData;
actionFilter.onchange = filterData;

updateConnectionStatus(true);
