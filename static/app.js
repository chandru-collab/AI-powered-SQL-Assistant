function generateSessionId() {
    return 'session_' + Math.random().toString(36).substring(2, 11);
}

let chartInstance = null;
let currentSessionId = generateSessionId();
let currentResults = [];
let currentSql = "";
let isCustomDbConnected = false;

// Element references
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");
const chatMessages = document.getElementById("chat-messages");
const sendBtn = document.getElementById("send-btn");
const clearChatBtn = document.getElementById("clear-chat-btn");
const suggestionChipsContainer = document.getElementById("suggestion-chips-container");
const suggestChips = document.querySelectorAll(".chip");

const analyzerPlaceholder = document.getElementById("analyzer-placeholder");
const analyzerResults = document.getElementById("analyzer-results");
const generatedSqlCode = document.getElementById("generated-sql-code");
const copySqlBtn = document.getElementById("copy-sql-btn");
const technicalExplanation = document.getElementById("technical-explanation");
const businessExplanation = document.getElementById("business-explanation");
const resultsTable = document.getElementById("results-table");
const tableMeta = document.getElementById("table-meta");
const exportCsvBtn = document.getElementById("export-csv-btn");

const chartContainerWrapper = document.getElementById("chart-container-wrapper");
const analyticsChartCanvas = document.getElementById("analytics-chart");

const safetyBadge = document.getElementById("safety-badge");
const timeBadge = document.getElementById("time-badge");

const toggleHistoryBtn = document.getElementById("toggle-history-btn");
const closeDrawerBtn = document.getElementById("close-drawer-btn");
const historyDrawer = document.getElementById("history-drawer");
const drawerOverlay = document.getElementById("drawer-overlay");
const auditLogsList = document.getElementById("audit-logs-list");

// NEW: Connection & Schema Explorer Elements
const openConnectBtn = document.getElementById("open-connect-btn");
const connectionBadgeText = document.getElementById("connection-badge-text");
const connectionModalOverlay = document.getElementById("connection-modal-overlay");
const connectionModal = document.getElementById("connection-modal");
const closeConnectModalBtn = document.getElementById("close-connect-modal-btn");
const cancelConnectBtn = document.getElementById("cancel-connect-btn");
const connectionForm = document.getElementById("connection-form");
const connectErrorMsg = document.getElementById("connect-error-msg");
const testConnectBtn = document.getElementById("test-connect-btn");

const tabChatBtn = document.getElementById("tab-chat-btn");
const tabSchemaBtn = document.getElementById("tab-schema-btn");
const tabChatContent = document.getElementById("tab-chat-content");
const tabSchemaContent = document.getElementById("tab-schema-content");

const schemaDbName = document.getElementById("schema-db-name");
const disconnectDbBtn = document.getElementById("disconnect-db-btn");
const schemaTreeView = document.getElementById("schema-tree-view");

// --- Event Listeners ---

function init() {
    // Load default schema on start
    loadDatabaseSchema();

    // Form submission
    chatForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const question = chatInput.value.trim();
        if (question) {
            submitQuestion(question);
        }
    });

    // Chips action
    suggestChips.forEach(chip => {
        chip.addEventListener("click", () => {
            const prompt = chip.getAttribute("data-prompt");
            chatInput.value = prompt;
            submitQuestion(prompt);
        });
    });

    // Clear history/memory
    clearChatBtn.addEventListener("click", resetConversationMemory);

    // Copy SQL
    copySqlBtn.addEventListener("click", copySqlToClipboard);

    // Export CSV
    exportCsvBtn.addEventListener("click", exportResultsToCSV);

    // History drawer toggling
    toggleHistoryBtn.addEventListener("click", openHistoryDrawer);
    closeDrawerBtn.addEventListener("click", closeHistoryDrawer);
    drawerOverlay.addEventListener("click", closeHistoryDrawer);

    // Tab switching
    tabChatBtn.addEventListener("click", () => switchTab("chat"));
    tabSchemaBtn.addEventListener("click", () => switchTab("schema"));

    // Connection Modal triggers
    openConnectBtn.addEventListener("click", openConnectionModal);
    closeConnectModalBtn.addEventListener("click", closeConnectionModal);
    cancelConnectBtn.addEventListener("click", closeConnectionModal);
    connectionModalOverlay.addEventListener("click", closeConnectionModal);

    // Connect form submission
    connectionForm.addEventListener("submit", handleConnectionSubmit);

    // Disconnect Action
    disconnectDbBtn.addEventListener("click", handleDisconnect);
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
} else {
    init();
}

// --- Tab Controller ---

function switchTab(tab) {
    if (tab === "chat") {
        tabChatBtn.classList.add("active");
        tabSchemaBtn.classList.remove("active");
        tabChatContent.style.display = "flex";
        tabSchemaContent.style.display = "none";
    } else {
        tabSchemaBtn.classList.add("active");
        tabChatBtn.classList.remove("active");
        tabChatContent.style.display = "none";
        tabSchemaContent.style.display = "block";
        loadDatabaseSchema(); // Refresh schema tree when opening tab
    }
}

// --- Connection Modal Functions ---

function openConnectionModal() {
    connectionModal.classList.add("open");
    connectionModalOverlay.style.display = "block";
    connectErrorMsg.style.display = "none";
}

function closeConnectionModal() {
    connectionModal.classList.remove("open");
    connectionModalOverlay.style.display = "none";
}

async function handleConnectionSubmit(e) {
    e.preventDefault();
    connectErrorMsg.style.display = "none";

    const submitText = testConnectBtn.querySelector("span");
    const submitIcon = testConnectBtn.querySelector("i");
    submitText.textContent = "Connecting...";
    submitIcon.className = "fa-solid fa-circle-notch fa-spin";
    testConnectBtn.disabled = true;

    const credentials = {
        host: document.getElementById("db-host").value.trim(),
        port: parseInt(document.getElementById("db-port").value) || 3306,
        user: document.getElementById("db-user").value.trim(),
        password: document.getElementById("db-password").value,
        database: document.getElementById("db-name").value.trim(),
        session_id: currentSessionId
    };

    try {
        const response = await fetch("/connect", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(credentials)
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.detail || "Connection failed.");
        }

        // Successfully connected!
        isCustomDbConnected = true;
        closeConnectionModal();

        // Update header UI
        connectionBadgeText.textContent = credentials.database;
        openConnectBtn.classList.add("connected");

        // Update Schema Tab info
        schemaDbName.textContent = credentials.database;
        disconnectDbBtn.style.display = "inline-flex";

        // Render Schema Tree
        renderSchemaTree(data.schema);

        // Hide default suggestion chips (since columns changed)
        suggestionChipsContainer.style.display = "none";

        // Append message
        appendMessage("bot", `✅ **Connected Successfully** to database **${credentials.database}** on host \`${credentials.host}\`!<br>AI agent successfully retrieved active database columns, keys, and table relationships. You can now start asking analytics questions about this database.`);

        // Auto-switch to explorer tab to show the user the schema tree
        switchTab("schema");

    } catch (err) {
        connectErrorMsg.textContent = err.message;
        connectErrorMsg.style.display = "block";
    } finally {
        submitText.textContent = "Connect";
        submitIcon.className = "fa-solid fa-circle-arrow-right";
        testConnectBtn.disabled = false;
    }
}

async function handleDisconnect() {
    try {
        const response = await fetch("/disconnect", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ session_id: currentSessionId })
        });

        const data = await response.json();

        isCustomDbConnected = false;

        // Reset Header UI
        connectionBadgeText.textContent = "Connect MySQL";
        openConnectBtn.classList.remove("connected");

        // Reset Schema Tab
        schemaDbName.textContent = data.database;
        disconnectDbBtn.style.display = "none";

        // Reload default schema tree
        loadDatabaseSchema();

        // Restore suggestion chips
        suggestionChipsContainer.style.display = "flex";

        appendMessage("bot", `🔌 **Disconnected** from custom database. Reverted back to the default analytics mock database.`);
        switchTab("chat");

    } catch (err) {
        console.error("Disconnect error:", err);
    }
}

// --- Fetch & Render Schema Tree ---

async function loadDatabaseSchema() {
    try {
        const response = await fetch(`/schema?session_id=${currentSessionId}`);
        const data = await response.json();

        schemaDbName.textContent = data.database;
        if (isCustomDbConnected) {
            disconnectDbBtn.style.display = "inline-flex";
            connectionBadgeText.textContent = data.database;
            openConnectBtn.classList.add("connected");
            suggestionChipsContainer.style.display = "none";
        } else {
            disconnectDbBtn.style.display = "none";
            connectionBadgeText.textContent = "Connect MySQL";
            openConnectBtn.classList.remove("connected");
            suggestionChipsContainer.style.display = "flex";
        }

        renderSchemaTree(data.schema);
    } catch (err) {
        schemaTreeView.innerHTML = `<div style="color: var(--error-color); padding: 1rem; text-align: center;"><i class="fa-solid fa-circle-exclamation" style="font-size: 1.5rem; margin-bottom: 0.5rem;"></i><p>Failed to load database schema tree.</p></div>`;
    }
}

function renderSchemaTree(schema) {
    schemaTreeView.innerHTML = "";

    const tables = Object.keys(schema);

    if (tables.length === 0) {
        schemaTreeView.innerHTML = `
            <div style="color: var(--text-muted); text-align: center; padding: 3rem 1rem;">
                <i class="fa-solid fa-folder-open" style="font-size: 2rem; margin-bottom: 1rem; opacity: 0.5;"></i>
                <p>No tables found in this database schema.</p>
            </div>
        `;
        return;
    }

    tables.forEach(tableName => {
        const columns = schema[tableName];

        // Create table node wrapper
        const tableNode = document.createElement("div");
        tableNode.classList.add("schema-table-node");

        // Table header card
        const tableHeader = document.createElement("div");
        tableHeader.classList.add("schema-table-header");
        tableHeader.innerHTML = `
            <div class="table-title">
                <i class="fa-solid fa-table table-node-icon"></i>
                <span class="table-name-text">${tableName}</span>
            </div>
            <i class="fa-solid fa-chevron-down arrow-icon"></i>
        `;

        // Columns wrapper
        const columnsContainer = document.createElement("div");
        columnsContainer.classList.add("schema-columns-container");

        columns.forEach(col => {
            const colNode = document.createElement("div");
            colNode.classList.add("schema-column-node");

            // Determine appropriate type icon
            let typeIcon = '<i class="fa-solid fa-align-left type-icon-text"></i>'; // Default string
            const typeLower = col.type.toLowerCase();

            if (col.is_primary) {
                typeIcon = '<i class="fa-solid fa-key type-icon-pk" title="Primary Key"></i>';
            } else if (typeLower.includes("int") || typeLower.includes("decimal") || typeLower.includes("float") || typeLower.includes("double")) {
                typeIcon = '<i class="fa-solid fa-hashtag type-icon-number"></i>';
            } else if (typeLower.includes("date") || typeLower.includes("time")) {
                typeIcon = '<i class="fa-solid fa-calendar-days type-icon-date"></i>';
            }

            colNode.innerHTML = `
                <span class="column-meta-pair">
                    ${typeIcon}
                    <span class="column-name-text">${col.name}</span>
                </span>
                <span class="column-type-label">${col.type}</span>
            `;
            columnsContainer.appendChild(colNode);
        });

        // Setup toggle event listener
        tableHeader.addEventListener("click", () => {
            tableNode.classList.toggle("collapsed");
        });

        tableNode.appendChild(tableHeader);
        tableNode.appendChild(columnsContainer);
        schemaTreeView.appendChild(tableNode);
    });
}

// --- Conversational Chat logic ---

function appendMessage(role, content) {
    const messageDiv = document.createElement("div");
    messageDiv.classList.add("message", `${role}-message`);

    const iconDiv = document.createElement("div");
    iconDiv.classList.add("message-icon");
    iconDiv.innerHTML = role === "user" ? '<i class="fa-solid fa-user"></i>' : '<i class="fa-solid fa-robot"></i>';

    const contentDiv = document.createElement("div");
    contentDiv.classList.add("message-content");

    if (role === "bot" || role === "system") {
        contentDiv.innerHTML = formatExplanationText(content);
    } else {
        const p = document.createElement("p");
        p.textContent = content;
        contentDiv.appendChild(p);
    }

    messageDiv.appendChild(iconDiv);
    messageDiv.appendChild(contentDiv);
    chatMessages.appendChild(messageDiv);

    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function showLoadingIndicator() {
    const loadingDiv = document.createElement("div");
    loadingDiv.classList.add("message", "bot-message", "loading-bubble");
    loadingDiv.id = "chat-loading-bubble";

    const iconDiv = document.createElement("div");
    iconDiv.classList.add("message-icon");
    iconDiv.innerHTML = '<i class="fa-solid fa-robot"></i>';

    const contentDiv = document.createElement("div");
    contentDiv.classList.add("message-content");
    contentDiv.innerHTML = `
        <div class="typing-dots">
            <span></span>
            <span></span>
            <span></span>
        </div>
    `;

    loadingDiv.appendChild(iconDiv);
    loadingDiv.appendChild(contentDiv);
    chatMessages.appendChild(loadingDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function removeLoadingIndicator() {
    const bubble = document.getElementById("chat-loading-bubble");
    if (bubble) {
        bubble.remove();
    }
}

function formatExplanationText(text) {
    let formatted = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    formatted = formatted.replace(/\n/g, '<br>');
    return `<p>${formatted}</p>`;
}

function highlightSQL(sql) {
    if (!sql) return "";

    const strings = [];
    const getLetterCode = (num) => {
        let code = "";
        let n = num;
        while (n >= 0) {
            code = String.fromCharCode(65 + (n % 26)) + code;
            n = Math.floor(n / 26) - 1;
        }
        return code;
    };

    let processed = sql.replace(/(['"])(.*?)\1/g, (match) => {
        const code = getLetterCode(strings.length);
        const placeholder = `__STRPLACEHOLDER${code}__`;
        strings.push({ placeholder, match });
        return placeholder;
    });

    const keywords = [
        "SELECT", "FROM", "WHERE", "JOIN", "LEFT JOIN", "RIGHT JOIN", "INNER JOIN",
        "ON", "GROUP BY", "ORDER BY", "LIMIT", "AND", "OR", "IN", "AS", "COUNT",
        "SUM", "AVG", "MIN", "MAX", "HAVING", "WITH", "DESC", "ASC", "BY", "MONTH", "YEAR", "DATE"
    ];

    keywords.forEach(keyword => {
        const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
        processed = processed.replace(regex, `<span style="color: #ff7675; font-weight: bold;">$&</span>`);
    });

    processed = processed.replace(/\b(\d+)\b/g, `<span style="color: #0984e3;">$1</span>`);

    strings.forEach(item => {
        const highlightedStr = `<span style="color: #55efc4;">${item.match}</span>`;
        processed = processed.replace(item.placeholder, highlightedStr);
    });

    return processed;
}

async function submitQuestion(question) {
    appendMessage("user", question);
    chatInput.value = "";
    chatInput.disabled = true;
    sendBtn.disabled = true;

    showLoadingIndicator();

    try {
        const response = await fetch("/query", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                question: question,
                session_id: currentSessionId
            })
        });

        const data = await response.json();
        removeLoadingIndicator();

        if (!response.ok) {
            const errMsg = data.detail || "An unexpected error occurred.";
            appendMessage("bot", `⚠️ **Error Details**:\n${errMsg}`);
            displayErrorInAnalyzer(errMsg);
            return;
        }

        appendMessage("bot", data.explanation);
        displayQueryData(data);

    } catch (err) {
        removeLoadingIndicator();
        appendMessage("bot", `🔌 **Connection Error**: Failed to reach the backend server. Make sure FastAPI is running.`);
        displayErrorInAnalyzer("Failed to connect to backend server.");
    } finally {
        chatInput.disabled = false;
        sendBtn.disabled = false;
        chatInput.focus();
    }
}

// --- Render Visualizer Dashboard ---

function displayQueryData(data) {
    currentResults = data.results;
    currentSql = data.sql;

    analyzerPlaceholder.style.display = "none";
    analyzerResults.style.display = "block";

    safetyBadge.style.display = "inline-block";
    safetyBadge.textContent = "Safe Mode";
    safetyBadge.className = "badge";

    timeBadge.style.display = "inline-block";
    timeBadge.textContent = `${data.execution_time_ms.toFixed(2)} ms`;

    generatedSqlCode.innerHTML = highlightSQL(data.sql);
    technicalExplanation.textContent = data.sql_explanation;

    businessExplanation.innerHTML = formatExplanationText(data.explanation);

    buildDataTable(data.results);
    renderChart(data.results, data.chart_recommendation);
}

function displayErrorInAnalyzer(errorMsg) {
    analyzerPlaceholder.style.display = "none";
    analyzerResults.style.display = "block";

    safetyBadge.style.display = "inline-block";
    safetyBadge.textContent = "Error / Blocked";
    safetyBadge.className = "badge rejected";

    timeBadge.style.display = "none";

    generatedSqlCode.innerHTML = `<span style="color: #ff7675;">/* Execution Aborted */</span>`;
    technicalExplanation.textContent = "The query could not be analyzed due to validation safety checks or syntax errors.";

    businessExplanation.innerHTML = `<span style="color: #ff7675;"><strong>Error Reason:</strong><br>${errorMsg}</span>`;

    buildDataTable([]);
    renderChart([], { type: "none" });
}

// --- Data Table Builders ---

function buildDataTable(rows) {
    const thead = resultsTable.querySelector("thead");
    const tbody = resultsTable.querySelector("tbody");

    thead.innerHTML = "";
    tbody.innerHTML = "";

    if (!rows || rows.length === 0) {
        thead.innerHTML = `<tr><th>Status</th></tr>`;
        tbody.innerHTML = `<tr><td style="color: var(--text-muted); text-align: center; padding: 2rem;">No data records found</td></tr>`;
        tableMeta.textContent = "Showing 0 rows";
        exportCsvBtn.disabled = true;
        return;
    }

    exportCsvBtn.disabled = false;
    const columns = Object.keys(rows[0]);

    const headerRow = document.createElement("tr");
    headerRow.innerHTML = `<th>#</th>` + columns.map(col => `<th>${col}</th>`).join("");
    thead.appendChild(headerRow);

    rows.forEach((row, index) => {
        const tr = document.createElement("tr");
        const rowNumCell = `<td><strong>${index + 1}</strong></td>`;
        const cells = columns.map(col => {
            let val = row[col];
            if (val === null || val === undefined) return `<td><em style="color: var(--text-muted);">NULL</em></td>`;
            if (typeof val === 'number' && !Number.isInteger(val)) return `<td>${val.toFixed(2)}</td>`;
            return `<td>${val}</td>`;
        }).join("");

        tr.innerHTML = rowNumCell + cells;
        tbody.appendChild(tr);
    });

    tableMeta.textContent = `Showing ${rows.length} row(s)`;
}

// --- Chart rendering via Chart.js ---

function renderChart(rows, recommendation) {
    if (!recommendation || recommendation.type === "none" || !rows || rows.length === 0) {
        chartContainerWrapper.style.display = "none";
        return;
    }

    const { type, xAxisColumn, yAxisColumn } = recommendation;

    const firstRow = rows[0];
    if (!(xAxisColumn in firstRow) || !(yAxisColumn in firstRow)) {
        chartContainerWrapper.style.display = "none";
        return;
    }

    chartContainerWrapper.style.display = "block";

    if (chartInstance) {
        chartInstance.destroy();
    }

    const labels = rows.map(row => row[xAxisColumn]);
    const values = rows.map(row => parseFloat(row[yAxisColumn]) || 0);

    const colors = [
        'rgba(108, 92, 231, 0.75)',
        'rgba(0, 206, 201, 0.75)',
        'rgba(9, 132, 227, 0.75)',
        'rgba(253, 203, 110, 0.75)',
        'rgba(255, 118, 117, 0.75)',
        'rgba(162, 155, 254, 0.75)',
        'rgba(225, 112, 85, 0.75)',
        'rgba(0, 184, 148, 0.75)'
    ];

    const borderColors = colors.map(c => c.replace('0.75', '1.0'));

    const chartConfig = {
        type: type,
        data: {
            labels: labels,
            datasets: [{
                label: yAxisColumn,
                data: values,
                backgroundColor: type === 'pie' ? colors : colors[0],
                borderColor: type === 'pie' ? borderColors : borderColors[0],
                borderWidth: 1.5,
                borderRadius: type === 'bar' ? 6 : 0,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: type === 'pie',
                    labels: {
                        color: '#a5b1c2',
                        font: { family: 'Plus Jakarta Sans' }
                    }
                },
                tooltip: {
                    backgroundColor: '#121725',
                    titleFont: { family: 'Outfit' },
                    bodyFont: { family: 'Plus Jakarta Sans' },
                    borderColor: 'rgba(255,255,255,0.08)',
                    borderWidth: 1
                }
            },
            scales: type === 'pie' ? {} : {
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(255,255,255,0.04)' },
                    ticks: { color: '#a5b1c2', font: { family: 'Plus Jakarta Sans' } }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: '#a5b1c2', font: { family: 'Plus Jakarta Sans' } }
                }
            }
        }
    };

    chartInstance = new Chart(analyticsChartCanvas, chartConfig);
}

// --- Utility Button Actions ---

function copySqlToClipboard() {
    if (!currentSql) return;

    navigator.clipboard.writeText(currentSql).then(() => {
        const span = copySqlBtn.querySelector("span");
        const icon = copySqlBtn.querySelector("i");

        span.textContent = "Copied!";
        icon.className = "fa-solid fa-check";

        setTimeout(() => {
            span.textContent = "Copy";
            icon.className = "fa-solid fa-copy";
        }, 2000);
    });
}

function exportResultsToCSV() {
    if (!currentResults || currentResults.length === 0) return;

    const columns = Object.keys(currentResults[0]);
    let csvRows = [columns.join(",")];

    for (const row of currentResults) {
        const values = columns.map(col => {
            const val = row[col];
            if (val === null || val === undefined) return "";
            let valStr = String(val);
            if (valStr.includes(",") || valStr.includes('"') || valStr.includes("\n")) {
                valStr = `"${valStr.replace(/"/g, '""')}"`;
            }
            return valStr;
        });
        csvRows.push(values.join(","));
    }

    const csvContent = "data:text/csv;charset=utf-8," + csvRows.join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `sql_assistant_results_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

async function resetConversationMemory() {
    try {
        await fetch("/clear-history", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ session_id: currentSessionId })
        });

        currentSessionId = generateSessionId();

        chatMessages.innerHTML = `
            <div class="message system-message">
                <div class="message-icon"><i class="fa-solid fa-robot"></i></div>
                <div class="message-content">
                    <p>Conversation history and session memory has been fully reset. What query can I run for you now?</p>
                </div>
            </div>
        `;

        analyzerPlaceholder.style.display = "flex";
        analyzerResults.style.display = "none";

        appendMessage("system", "Session memory cleared. Start asking questions.");

    } catch (err) {
        console.error("Failed to clear conversational memory: ", err);
    }
}

// --- History Drawer & Audit Logging Panel ---

function openHistoryDrawer() {
    historyDrawer.classList.add("open");
    drawerOverlay.style.display = "block";
    loadAuditLogs();
}

function closeHistoryDrawer() {
    historyDrawer.classList.remove("open");
    drawerOverlay.style.display = "none";
}

async function loadAuditLogs() {
    auditLogsList.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 2rem;"><i class="fa-solid fa-spinner fa-spin" style="font-size: 1.5rem; margin-bottom: 0.5rem;"></i><p>Loading audit trail...</p></div>`;

    try {
        const response = await fetch("/history");
        const logs = await response.json();

        auditLogsList.innerHTML = "";

        if (!logs || logs.length === 0) {
            auditLogsList.innerHTML = `
                <div class="log-empty">
                    <i class="fa-solid fa-folder-open" style="font-size: 2.5rem; color: var(--text-muted); margin-bottom: 1rem; opacity: 0.5;"></i>
                    <p>No query audit logs recorded yet.</p>
                </div>
            `;
            return;
        }

        logs.forEach(log => {
            const card = document.createElement("div");
            card.classList.add("audit-card");

            const dateStr = new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' ' + new Date(log.timestamp).toLocaleDateString();
            const statusClass = log.status;

            card.innerHTML = `
                <div class="audit-header">
                    <span><i class="fa-solid fa-clock"></i> ${dateStr}</span>
                    <span><i class="fa-solid fa-stopwatch"></i> ${log.execution_time_ms.toFixed(1)}ms</span>
                </div>
                <div class="audit-question">Q: "${escapeHTML(log.question)}"</div>
                ${log.sql ? `<div class="audit-sql">${escapeHTML(log.sql)}</div>` : ''}
                <div class="audit-footer">
                    <span class="status-indicator ${statusClass}">${log.status}</span>
                    ${log.error ? `<span style="color: var(--error-color); font-size: 0.75rem; text-align: right; max-width: 70%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHTML(log.error)}">${escapeHTML(log.error)}</span>` : ''}
                </div>
            `;

            auditLogsList.appendChild(card);
        });

    } catch (err) {
        auditLogsList.innerHTML = `<div style="color: var(--error-color); padding: 1.5rem; text-align: center;"><i class="fa-solid fa-triangle-exclamation" style="font-size: 2rem; margin-bottom: 0.5rem;"></i><p>Failed to load query audits.</p></div>`;
    }
}

function escapeHTML(str) {
    return str.replace(/[&<>'"]/g,
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag] || tag)
    );
}
