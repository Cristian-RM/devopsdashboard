// main.js
import { fetchWorkItemsForProject } from './azureDevOpsApi.js';
import { getDashboardSummary, groupByProject, getActivitySummary, transformTaskTableRows } from './dataTransform.js';
import { renderActivityChart, renderProjectChart } from './charts.js';

document.addEventListener('DOMContentLoaded', () => {
    const mainContent = document.getElementById('main-content');
    const dashboardBtn = document.getElementById('dashboardBtn');
    const tasksBtn = document.getElementById('tasksBtn');

    dashboardBtn.addEventListener('click', showDashboard);
    tasksBtn.addEventListener('click', showTasksTable);

    // Mostrar dashboard por defecto
    showDashboard();
});

function saveConfigToLocal(config) {
    localStorage.setItem('devopsConfig', JSON.stringify(config));
}
function loadConfigFromLocal() {
    try {
        return JSON.parse(localStorage.getItem('devopsConfig')) || {};
    } catch { return {}; }
}

function saveAssignedUsersToLocal(users) {
    localStorage.setItem('assignedUsers', JSON.stringify(users));
}
function loadAssignedUsersFromLocal() {
    try {
        return JSON.parse(localStorage.getItem('assignedUsers') || '[]');
    } catch { return []; }
}

function saveFiltersToLocal(filters) {
    localStorage.setItem('filters', JSON.stringify(filters));
}
function loadFiltersFromLocal() {
    try {
        return JSON.parse(localStorage.getItem('filters') || '{}');
    } catch { return {}; }
}

function setFilterInputsFromLocal() {
    const filters = loadFiltersFromLocal();
    if (document.getElementById('dateFrom')) document.getElementById('dateFrom').value = filters.dateFrom || '';
    if (document.getElementById('dateTo')) document.getElementById('dateTo').value = filters.dateTo || '';
    if (document.getElementById('freeDays')) document.getElementById('freeDays').value = filters.freeDays || '';
    if (document.getElementById('assignedTo')) document.getElementById('assignedTo').value = filters.assignedTo || 'ALL';
}

function formatDateOnly(dateStr) {
    // Si ya es YYYY-MM-DD, la deja igual; si viene con hora, la recorta
    if (!dateStr) return '';
    return dateStr.split('T')[0];
}

function getFiltersFromInputs() {
    return {
        dateFrom: formatDateOnly(document.getElementById('dateFrom')?.value || ''),
        dateTo: formatDateOnly(document.getElementById('dateTo')?.value || ''),
        freeDays: document.getElementById('freeDays')?.value || '',
        assignedTo: document.getElementById('assignedTo')?.value || 'ALL'
    };
}

function getDefaultWIQL() {
    return `SELECT [System.Id], [System.Title], [System.WorkItemType], [System.State], [System.TeamProject], [System.CreatedDate], [Microsoft.VSTS.Scheduling.TargetDate], [Microsoft.VSTS.Scheduling.StartDate], [Microsoft.VSTS.Common.Activity], [Custom.DurationInHours], [System.Parent] FROM WorkItems WHERE [Microsoft.VSTS.Scheduling.TargetDate] >= '${'${dateFrom}'}' AND [Microsoft.VSTS.Scheduling.TargetDate] <= '${'${dateTo}'}'`;
}

function showConfigPopup() {
    const config = loadConfigFromLocal();
    const wiql = config.wiql || getDefaultWIQL();
    const popup = document.createElement('div');
    popup.id = 'config-popup';
    popup.style = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.4);z-index:9999;display:flex;align-items:center;justify-content:center;';
    popup.innerHTML = `
        <div style="background:#fff;padding:30px 30px 20px 30px;border-radius:12px;min-width:320px;max-width:90vw;box-shadow:0 8px 32px #0002;position:relative;">
            <h3>Configuración de Conexión</h3>
            <div class="form-group">
                <label for="popup-organization">Organización</label>
                <input type="text" id="popup-organization" value="${config.organization || ''}" placeholder="tu-organizacion">
            </div>
            <div class="form-group">
                <label for="popup-pat">Personal Access Token</label>
                <input type="password" id="popup-pat" value="${config.pat || ''}" placeholder="tu-pat-token">
            </div>
            <div class="form-group">
                <label for="popup-wiql">Consulta WIQL personalizada</label>
                <textarea id="popup-wiql" rows="6" style="width:100%;border-radius:8px;padding:8px;">${wiql}</textarea>
                <small>Puedes usar <b>${'${dateFrom}'}</b> y <b>${'${dateTo}'}</b> para insertar las fechas de los filtros.<br>Para campos tipo <b>date</b> (como TargetDate), NO incluyas la hora.<br>Ejemplo: <code>[Microsoft.VSTS.Scheduling.TargetDate] &gt;= '${'${dateFrom}'}'</code></small>
            </div>
            <div class="form-group">
                <label style="display:flex;align-items:center;gap:8px;">
                    <input type="checkbox" id="popup-devMode" ${config.devMode ? 'checked' : ''}>
                    Modo desarrollador (muestra logs de debug)
                </label>
            </div>
            <button class="btn btn-primary" id="saveConfigBtn">Guardar</button>
            <button class="btn btn-secondary" id="closeConfigBtn">Cancelar</button>
        </div>
    `;
    document.body.appendChild(popup);
    document.getElementById('saveConfigBtn').onclick = function() {
        const newConfig = {
            organization: document.getElementById('popup-organization').value,
            pat: document.getElementById('popup-pat').value,
            wiql: document.getElementById('popup-wiql').value,
            devMode: document.getElementById('popup-devMode').checked
        };
        saveConfigToLocal(newConfig);
        document.body.removeChild(popup);
        showDashboard();
    };
    document.getElementById('closeConfigBtn').onclick = function() {
        document.body.removeChild(popup);
    };
}

function getConfig() {
    return loadConfigFromLocal();
}

function renderConfigButton() {
    return `<button class="btn btn-secondary" id="editConfigBtn" style="margin-bottom:15px;float:right;">Editar configuración</button>`;
}

function renderAssignedToSelect(users, selected) {
    let html = `<div class="form-group"><label for="assignedTo">Asignado a</label><select id="assignedTo">`;
    html += `<option value="ALL">Todos</option>`;
    users.forEach(u => {
        html += `<option value="${u}"${selected === u ? ' selected' : ''}>${u}</option>`;
    });
    html += `</select></div>`;
    return html;
}

// Lista base de personas para el filtro de asignados
const BASE_ASSIGNED_USERS = [
    "Alexander Tejada <alexander.tejada@lascatalinascr.com>",
    "Cristian Rodriguez <cristian.rodriguez@lascatalinascr.com>",
    "Francisco Lopez <francisco.lopez@lascatalinascr.com>",
    "Jennifer Corrales <jennifer.corrales@lascatalinascr.com>",
    "Joshua Hernandez <joshua.hernandez@lascatalinascr.com>",
    "Luis Rodriguez <luis.rodriguez@lascatalinascr.com>",
    "Santiago Paniagua <santiago.paniagua@lascatalinascr.com>"
];

// Al inicio, siempre inicializa el localStorage con la lista base si no existe o es diferente
function ensureBaseAssignedUsers() {
    const current = loadAssignedUsersFromLocal();
    const baseSorted = [...BASE_ASSIGNED_USERS].sort();
    const currentSorted = [...current].sort();
    const isSame = baseSorted.length === currentSorted.length && baseSorted.every((v, i) => v === currentSorted[i]);
    if (!isSame) {
        saveAssignedUsersToLocal(BASE_ASSIGNED_USERS);
    }
}

function showDashboard() {
    ensureBaseAssignedUsers();
    const config = getConfig();
    const assignedUsers = loadAssignedUsersFromLocal();
    const filters = loadFiltersFromLocal();
    const mainContent = document.getElementById('main-content');
    mainContent.innerHTML = `
        ${renderConfigButton()}
        <div class="config-section">
            <div class="form-grid" style="display:flex;gap:20px;align-items:end;">
                <div class="form-group">
                    <label for="dateFrom">Fecha desde</label>
                    <input type="date" id="dateFrom">
                </div>
                <div class="form-group">
                    <label for="dateTo">Fecha hasta</label>
                    <input type="date" id="dateTo">
                </div>
                <div class="form-group">
                    <label for="freeDays">Días libres/vacaciones (YYYY-MM-DD, coma)</label>
                    <input type="text" id="freeDays" placeholder="2024-06-01,2024-06-05">
                </div>
                ${renderAssignedToSelect(assignedUsers, filters.assignedTo || 'ALL')}
                <button class="btn btn-primary" id="loadGlobalBtn" style="height:44px;">Cargar</button>
            </div>
        </div>
        <div id="dashboard-results" class="results" style="display:none;"></div>
    `;
    if (!config.organization || !config.pat) {
        showConfigPopup();
    }
    setFilterInputsFromLocal();
}

function showTasksTable() {
    ensureBaseAssignedUsers();
    const config = getConfig();
    const assignedUsers = loadAssignedUsersFromLocal();
    const filters = loadFiltersFromLocal();
    const mainContent = document.getElementById('main-content');
    mainContent.innerHTML = `
        ${renderConfigButton()}
        <div class="config-section">
            <div class="form-grid" style="display:flex;gap:20px;align-items:end;">
                <div class="form-group">
                    <label for="dateFrom">Fecha desde</label>
                    <input type="date" id="dateFrom">
                </div>
                <div class="form-group">
                    <label for="dateTo">Fecha hasta</label>
                    <input type="date" id="dateTo">
                </div>
                ${renderAssignedToSelect(assignedUsers, filters.assignedTo || 'ALL')}
                <button class="btn btn-primary" id="loadTasksBtn" style="height:44px;">Cargar</button>
            </div>
        </div>
        <div id="tasks-table-results" class="results" style="display:none;"></div>
    `;
    if (!config.organization || !config.pat) {
        showConfigPopup();
    }
    setFilterInputsFromLocal();
}

// Utilidades para fechas y días hábiles
function getBusinessDays(start, end, freeDays = []) {
    let count = 0;
    let current = new Date(start);
    end = new Date(end);
    freeDays = freeDays.map(d => d.trim());
    while (current <= end) {
        const day = current.getDay();
        const dateStr = current.toISOString().split('T')[0];
        if (day >= 1 && day <= 5 && !freeDays.includes(dateStr)) count++;
        current.setDate(current.getDate() + 1);
    }
    return count;
}

function parseFreeDays(str) {
    return str.split(',').map(s => s.trim()).filter(Boolean);
}

const COSTO_HORA = 39.29; // USD

// Función para obtener el modo desarrollador desde la configuración
function isDevMode() {
    const config = loadConfigFromLocal();
    return config.devMode || false;
}

let debugLogs = [];

function logDebug(info) {
    debugLogs.push({ time: new Date().toISOString(), ...info });
    if (isDevMode()) renderDebugLogs();
}

function renderDebugLogs() {
    let html = '<div style="background:#222;color:#fff;padding:10px;border-radius:8px;margin-top:20px;max-height:300px;overflow:auto;font-size:13px;">';
    html += '<b>🛠️ Debug Logs (modo desarrollador)</b><br><br>';
    debugLogs.slice(-30).forEach(log => {
        html += `<div style="margin-bottom:8px;"><span style="color:#aaa;">[${log.time}]</span> <pre style="white-space:pre-wrap;background:#333;color:#fff;padding:6px;border-radius:4px;">${JSON.stringify(log, null, 2)}</pre></div>`;
    });
    html += '</div>';
    let debugDiv = document.getElementById('debug-logs');
    if (!debugDiv) {
        debugDiv = document.createElement('div');
        debugDiv.id = 'debug-logs';
        document.getElementById('dashboard-results').appendChild(debugDiv);
    }
    debugDiv.innerHTML = html;
}

// Obtiene todos los proyectos de la organización
async function fetchAllProjects(org, pat) {
    const url = `https://dev.azure.com/${org}/_apis/projects?api-version=7.0`;
    logDebug({ action: 'fetchAllProjects', url });
    const res = await fetch(url, {
        headers: { 'Authorization': 'Basic ' + btoa(':' + pat) }
    });
    if (!res.ok) {
        logDebug({ action: 'fetchAllProjects', url, status: res.status, statusText: res.statusText });
        throw new Error('No se pudieron obtener los proyectos');
    }
    const data = await res.json();
    logDebug({ action: 'fetchAllProjects', url, resultCount: (data.value||[]).length });
    return data.value || [];
}

async function fetchWorkItemsWithHierarchy(org, project, pat, dateFrom, dateTo) {
    // WIQL para traer work items con jerarquía (Epica, PBI, Tarea)
    const wiql = {
        query: `SELECT [System.Id], [System.Title], [System.WorkItemType], [System.State], [System.CreatedDate], [System.ChangedDate], [Custom.DurationInHours], [Custom.Activity], [System.Parent] FROM WorkItems WHERE [System.TeamProject] = '${project}' AND [System.ChangedDate] >= '${dateFrom}T00:00:00Z' AND [System.ChangedDate] <= '${dateTo}T23:59:59Z'`
    };
    const url = `https://dev.azure.com/${org}/${project}/_apis/wit/wiql?api-version=7.0`;
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Authorization': 'Basic ' + btoa(':' + pat), 'Content-Type': 'application/json' },
        body: JSON.stringify(wiql)
    });
    if (!res.ok) return [];
    const data = await res.json();
    if (!data.workItems || data.workItems.length === 0) return [];
    // Obtener detalles
    const ids = data.workItems.map(wi => wi.id);
    const batchSize = 100;
    let allDetails = [];
    for (let i = 0; i < ids.length; i += batchSize) {
        const batchIds = ids.slice(i, i + batchSize).join(',');
        const detailsUrl = `https://dev.azure.com/${org}/_apis/wit/workitems?ids=${batchIds}&fields=System.Id,System.Title,System.WorkItemType,System.State,System.CreatedDate,System.ChangedDate,Custom.DurationInHours,Custom.Activity,System.Parent&api-version=7.0`;
        const detailsRes = await fetch(detailsUrl, {
            headers: { 'Authorization': 'Basic ' + btoa(':' + pat) }
        });
        if (detailsRes.ok) {
            const detailsData = await detailsRes.json();
            allDetails = allDetails.concat(detailsData.value);
        }
    }
    return allDetails;
}

function getAuthHeaders() {
    const config = getConfig();
    return {
        'Authorization': 'Basic ' + btoa(':' + config.pat),
        'Content-Type': 'application/json'
    };
}

async function fetchCrossProjectWorkItems(org, pat, wiql) {
    const url = `https://dev.azure.com/${org}/_apis/Contribution/HierarchyQuery?api-version=7.0-preview`;
    const payload = {
        contributionIds: ["ms.vss-work-web.work-item-query-data-provider"],
        dataProviderContext: {
            properties: {
                useIsoDateFormat: true,
                wiql
            }
        }
    };
    logDebug({ action: 'fetchCrossProjectWorkItems', url, wiql });
    const res = await fetch(url, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload)
    });
    if (!res.ok) {
        let errorText = await res.text();
        logDebug({ action: 'fetchCrossProjectWorkItems', url, wiql, status: res.status, statusText: res.statusText, errorText });
        throw new Error('Error al consultar vista cross-project');
    }
    const data = await res.json();
    logDebug({ action: 'fetchCrossProjectWorkItems', url, wiql, columns: data?.dataProviders?.["ms.vss-work-web.work-item-query-data-provider"]?.data?.columns?.length, rows: data?.dataProviders?.["ms.vss-work-web.work-item-query-data-provider"]?.data?.payload?.rows?.length });
    return data?.dataProviders?.["ms.vss-work-web.work-item-query-data-provider"]?.data;
}

function parseCrossProjectRows(data) {
    if (!data || !data.payload || !data.payload.rows || !data.columns) return [];
    const columns = data.columns.map(c => c.name);
    return data.payload.rows.map(row => {
        const obj = {};
        columns.forEach((col, i) => {
            obj[col] = row[i];
        });
        return obj;
    });
}

function isValidDateRange(dateFrom, dateTo) {
    if (!dateFrom || !dateTo) return false;
    return new Date(dateFrom) <= new Date(dateTo);
}

function getWIQLWithFilters(wiql, filters) {
    // Solo la fecha (YYYY-MM-DD)
    const dateFrom = filters.dateFrom ? filters.dateFrom : '';
    const dateTo = filters.dateTo ? filters.dateTo : '';
    return wiql
        .replace(/\$\{dateFrom\}/g, dateFrom)
        .replace(/\$\{dateTo\}/g, dateTo);
}

// Extrae el nombre del proyecto de la WIQL si está presente
function extractProjectFromWIQL(wiql) {
    const match = wiql.match(/\[System\.TeamProject\]\s*=\s*'([^']+)'/i);
    return match ? match[1] : null;
}

// Hardcodear el nombre del proyecto a usar en las consultas
const HARDCODED_PROJECT = 'Devops System Process';

// Reemplazo la lógica principal para dashboard y tabla:
async function loadGlobalDashboard() {
    const config = getConfig();
    const filters = loadFiltersFromLocal();
    const org = config.organization;
    const pat = config.pat;
    const dateFrom = filters.dateFrom;
    const dateTo = filters.dateTo;
    const freeDays = parseFreeDays(filters.freeDays);
    const resultsDiv = document.getElementById('dashboard-results');
    resultsDiv.style.display = 'block';
    resultsDiv.innerHTML = '<div class="loading">Cargando proyectos y work items...</div>';
    debugLogs = [];
    if (!isValidDateRange(dateFrom, dateTo)) {
        resultsDiv.innerHTML = '<div class="error">El rango de fechas es inválido. La fecha inicial debe ser menor o igual a la final.</div>';
        return;
    }
    try {
        const wiqlTemplate = config.wiql || getDefaultWIQL();
        const project = HARDCODED_PROJECT;
        // Obtener work items crudos
        const allWorkItems = await fetchWorkItemsForProject(org, project, pat, wiqlTemplate, filters);
        // Debug: verificar filtro y valores de assignedTo
        if (isDevMode()) {
            logDebug({ 
                action: 'loadGlobalDashboard', 
                assignedToFilter: filters.assignedTo,
                workItemsCount: allWorkItems.length,
                assignedToValues: [...new Set(allWorkItems.map(wi => wi.fields['System.AssignedTo']).filter(Boolean))]
            });
        }
        // Transformar datos para dashboard
        const dashboardSummary = getDashboardSummary(allWorkItems, { dateFrom, dateTo, freeDays, assignedTo: filters.assignedTo });
        // Preparar datos para gráfico de proyectos
        const grouped = groupByProject(allWorkItems);
        const projectSummary = Object.entries(grouped).map(([project, items]) => ({ project, hours: items.reduce((sum, wi) => sum + (parseFloat(wi.fields['Custom.DurationInHours']) || 0), 0) }));
        // Renderizar UI
        resultsDiv.innerHTML = `
            <h4>Resumen Global</h4>
            <div><strong>Total de horas registradas:</strong> ${dashboardSummary.totalHours.toFixed(2)}</div>
            <div><strong>Horas esperadas:</strong> ${dashboardSummary.expectedHours}</div>
            <div><strong>Efectividad:</strong> ${dashboardSummary.effectiveness.toFixed(1)}%</div>
            <div><strong>Promedio diario:</strong> ${dashboardSummary.avgPerDay.toFixed(2)} horas/día ${dashboardSummary.avgPerDay >= 7 ? '✅' : '⚠️'}</div>
            <div><strong>Costo hora:</strong> $${dashboardSummary.costoHora.toFixed(2)} USD</div>
            <div><strong>Costo total registrado:</strong> $${dashboardSummary.totalCost.toFixed(2)} USD</div>
            <h5>Resumen por proyecto</h5>
            <ul>
                ${dashboardSummary.projectListHtml}
            </ul>
            <div id="project-chart" style="max-width:600px;margin:30px auto;"></div>
            <div id="activity-chart" style="max-width:600px;margin:30px auto;"></div>
            ${isDevMode() ? '<div id="debug-logs"></div>' : ''}
        `;
        renderProjectChart(projectSummary);
        renderActivityChart(dashboardSummary.activitySummary);
        if (isDevMode()) renderDebugLogs();
    } catch (e) {
        resultsDiv.innerHTML = `<div class="error">${e.message}</div>${isDevMode() ? '<div id="debug-logs"></div>' : ''}`;
        logDebug({ action: 'loadGlobalDashboard', error: e.message, stack: e.stack });
        if (isDevMode()) renderDebugLogs();
    }
}

async function loadTasksTable() {
    const config = getConfig();
    const filters = loadFiltersFromLocal();
    const org = config.organization;
    const pat = config.pat;
    const dateFrom = filters.dateFrom;
    const dateTo = filters.dateTo;
    const resultsDiv = document.getElementById('tasks-table-results');
    resultsDiv.style.display = 'block';
    resultsDiv.innerHTML = '<div class="loading">Cargando tareas..."; </div>';
    if (!isValidDateRange(dateFrom, dateTo)) {
        resultsDiv.innerHTML = '<div class="error">El rango de fechas es inválido. La fecha inicial debe ser menor o igual a la final.</div>';
        return;
    }
    try {
        const wiqlTemplate = config.wiql || getDefaultWIQL();
        const project = HARDCODED_PROJECT;
        // Obtener work items crudos
        const allWorkItems = await fetchWorkItemsForProject(org, project, pat, wiqlTemplate, filters);
        // Transformar datos para la tabla
        const tableRows = transformTaskTableRows(allWorkItems);
        // Render tabla
        resultsDiv.innerHTML = `
            <h4>Tabla de Tareas</h4>
            <div><strong>Costo hora:</strong> $${COSTO_HORA.toFixed(2)} USD</div>
            <div style="overflow-x:auto;">
            <table style="width:100%;border-collapse:collapse;">
                <thead>
                    <tr>
                        <th>Proyecto</th>
                        <th>Épica</th>
                        <th>PBI</th>
                        <th>Título</th>
                        <th>Duración (h)</th>
                        <th>Costo (USD)</th>
                        <th>Start Date</th>
                        <th>Target Date</th>
                        <th>Activity</th>
                    </tr>
                </thead>
                <tbody>
                    ${tableRows.map(row => `
                        <tr>
                            <td>${row.project}</td>
                            <td>${row.epic}</td>
                            <td>${row.pbi}</td>
                            <td><a href="https://dev.azure.com/${org}/${row.project}/_workitems/edit/${row.id}" target="_blank">${row.title}</a></td>
                            <td>${row.duration.toFixed(2)}</td>
                            <td>$${row.cost.toFixed(2)}</td>
                            <td>${row.start}</td>
                            <td>${row.target}</td>
                            <td>${row.activity}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
            </div>
        `;
    } catch (e) {
        resultsDiv.innerHTML = `<div class="error">${e.message}</div>`;
    }
}

// Sobrescribo los hooks para los nuevos botones
if (typeof window !== 'undefined') {
    document.addEventListener('click', function(e) {
        if (e.target && e.target.id === 'editConfigBtn') {
            showConfigPopup();
        }
        if (e.target && e.target.id === 'loadGlobalBtn') {
            const filters = getFiltersFromInputs();
            saveFiltersToLocal(filters);
            loadGlobalDashboard();
        }
        if (e.target && e.target.id === 'loadTasksBtn') {
            const filters = getFiltersFromInputs();
            saveFiltersToLocal(filters);
            loadTasksTable();
        }
    });
} 