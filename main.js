// main.js
import { fetchWorkItemsForProject } from './azureDevOpsApi.js';
import { getDashboardSummary, groupByProject, getActivitySummary, transformTaskTableRows } from './dataTransform.js';
import { renderActivityChart, renderProjectChart } from './charts.js';

document.addEventListener('DOMContentLoaded', async () => {
    // 0. Asegurar usuarios base hardcodeados
    ensureBaseAssignedUsers();
    // 1. Inicializar select de usuario y días libres
    const assignedUsers = loadAssignedUsersFromLocal();
    const assignedToSelect = document.getElementById('assignedTo');
    if (assignedToSelect) {
        assignedToSelect.innerHTML = '<option value="ALL">Todos los usuarios</option>' +
            assignedUsers.map(u => `<option value="${u}">${u}</option>`).join('');
        // Set valor guardado
        const filters = loadFiltersFromLocal();
        assignedToSelect.value = filters.assignedTo || 'ALL';
        assignedToSelect.addEventListener('change', () => {
            const filters = loadFiltersFromLocal();
            filters.assignedTo = assignedToSelect.value;
            saveFiltersToLocal(filters);
        });
    }
    const freeDaysInput = document.getElementById('freeDays');
    if (freeDaysInput) {
        const filters = loadFiltersFromLocal();
        freeDaysInput.value = filters.freeDays || '';
        freeDaysInput.addEventListener('change', () => {
            const filters = loadFiltersFromLocal();
            filters.freeDays = freeDaysInput.value;
            saveFiltersToLocal(filters);
        });
    }
    // 2. Configuración: si falta token/org, mostrar popup antes de cargar datos
    const config = getConfig();
    if (!config.organization || !config.pat) {
        showConfigPopup();
        return;
    }
    // 3. Flatpickr: inicializa y guarda la instancia
    // Calcular semana actual (lunes a viernes)
    function getCurrentWeekRange() {
        const today = new Date();
        const day = today.getDay();
        // 0: domingo, 1: lunes, ..., 6: sábado
        const monday = new Date(today);
        monday.setDate(today.getDate() - ((day + 6) % 7));
        const friday = new Date(monday);
        friday.setDate(monday.getDate() + 4);
        return [monday, friday];
    }
    let defaultDates = getCurrentWeekRange();
    let fpInstance = flatpickr("#dateRange", {
        mode: "range",
        dateFormat: "Y-m-d",
        defaultDate: defaultDates,
        locale: {
            firstDayOfWeek: 1,
            weekdays: {
                shorthand: ["Do", "Lu", "Ma", "Mi", "Ju", "Vi", "Sa"],
                longhand: ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"],
            },
            months: {
                shorthand: ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"],
                longhand: ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"],
            },
        }
    });
    // 4. Botón de cargar: guarda filtros y recarga dashboard
    document.getElementById('loadGlobalBtn')?.addEventListener('click', () => {
        // Leer fechas directamente de flatpickr
        const selectedDates = fpInstance.selectedDates;
        let dateFrom = '', dateTo = '';
        if (selectedDates.length === 2) {
            dateFrom = selectedDates[0].toISOString().split('T')[0];
            dateTo = selectedDates[1].toISOString().split('T')[0];
        } else if (selectedDates.length === 1) {
            dateFrom = dateTo = selectedDates[0].toISOString().split('T')[0];
        }
        if (!dateFrom || !dateTo) {
            alert('Por favor selecciona un rango de fechas válido.');
            return;
        }
        // Actualizar el input visualmente
        document.getElementById('dateRange').value = `${dateFrom} a ${dateTo}`;
        const assignedTo = document.getElementById('assignedTo')?.value || 'ALL';
        const freeDays = document.getElementById('freeDays')?.value || '';
        // Guardar en localStorage
        saveFiltersToLocal({ dateFrom, dateTo, assignedTo, freeDays });
        updateDashboardVisual();
    });
    // 5. Botón de configuración
    document.getElementById('editConfigBtn')?.addEventListener('click', showConfigPopup);
    // 6. Cargar dashboard visual automáticamente (con filtros actuales)
    updateDashboardVisual();
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

// Inicializar flatpickr para el filtro de fechas
flatpickr("#dateRange", {
    mode: "range",
    dateFormat: "Y-m-d",
    defaultDate: [new Date(new Date().setDate(new Date().getDate() - 7)), new Date()],
    locale: {
        firstDayOfWeek: 1,
        weekdays: {
            shorthand: ["Do", "Lu", "Ma", "Mi", "Ju", "Vi", "Sa"],
            longhand: ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"],
        },
        months: {
            shorthand: ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"],
            longhand: ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"],
        },
    },
});

// Datos de ejemplo
const kpiData = {
    expected: 160,
    logged: 145,
    diff: -15,
    effectiveness: 90.6,
    sparkExpected: [8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8],
    sparkLogged: [7, 8, 7, 8, 8, 7, 8, 7, 8, 8, 7, 8, 7, 8, 8, 7, 8, 7, 8, 8],
    sparkDiff: [1, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0],
    sparkEffectiveness: [90, 92, 91, 89, 90, 91, 92, 90, 91, 90, 91, 92, 90, 91, 90, 91, 92, 90, 91, 90],
};

// Actualizar valores de KPIs
function updateKPIs() {
    document.getElementById("kpi-expected").textContent = kpiData.expected;
    document.getElementById("kpi-logged").textContent = kpiData.logged;
    document.getElementById("kpi-diff").textContent = kpiData.diff;
    document.getElementById("kpi-effectiveness").textContent = kpiData.effectiveness + "%";
}

// --- DASHBOARD VISUAL CON DATOS REALES ---
async function updateDashboardVisual() {
    // 1. Obtener filtros desde flatpickr
    let dateRange = document.getElementById('dateRange')?.value || '';
    let dateFrom = '', dateTo = '';
    if (dateRange.includes(' a ')) {
        [dateFrom, dateTo] = dateRange.split(' a ');
    } else if (dateRange) {
        // Si solo hay una fecha, usarla como ambos extremos
        dateFrom = dateTo = dateRange;
    }
    // Si el rango no es válido, usar últimos 7 días
    if (!dateFrom || !dateTo || isNaN(new Date(dateFrom)) || isNaN(new Date(dateTo))) {
        const today = new Date();
        const lastWeek = new Date();
        lastWeek.setDate(today.getDate() - 7);
        dateFrom = lastWeek.toISOString().split('T')[0];
        dateTo = today.toISOString().split('T')[0];
        // Actualizar el input visualmente
        if (document.getElementById('dateRange')) {
            document.getElementById('dateRange').value = `${dateFrom} a ${dateTo}`;
        }
    }
    // 2. Obtener config y filtros
    const config = getConfig();
    const org = config.organization;
    const pat = config.pat;
    const project = typeof HARDCODED_PROJECT !== 'undefined' ? HARDCODED_PROJECT : 'Devops System Process';
    if (!org || !pat) return;
    // 3. Obtener work items reales
    let filters = loadFiltersFromLocal();
    filters = { ...filters, dateFrom, dateTo };
    saveFiltersToLocal(filters);
    let workItems = [];
    try {
        const wiqlTemplate = config.wiql || getDefaultWIQL();
        workItems = await fetchWorkItemsForProject(org, project, pat, wiqlTemplate, filters);
    } catch (e) {
        // Si hay error, limpiar dashboard
        setKPIValues({ expected: 0, logged: 0, diff: 0, effectiveness: 0 });
        return;
    }
    // 4. Calcular KPIs
    const freeDays = filters.freeDays ? filters.freeDays.split(',').map(s => s.trim()).filter(Boolean) : [];
    const summary = getDashboardSummary(workItems, { dateFrom, dateTo, freeDays, assignedTo: filters.assignedTo });
    // 5. Agrupar por usuario
    const userMap = {};
    workItems.forEach(wi => {
        let user = wi.fields['System.AssignedTo'] || 'Sin asignar';
        // Si es objeto, extraer displayName o uniqueName
        if (typeof user === 'object' && user !== null) {
            user = user.displayName || user.uniqueName || 'Sin asignar';
        }
        const duration = parseFloat(wi.fields['Custom.DurationInHours']) || 0;
        if (!userMap[user]) userMap[user] = 0;
        userMap[user] += duration;
    });
    const userNames = Object.keys(userMap);
    const userHours = Object.values(userMap);
    // 6. Sparklines: evolución diaria
    const days = {};
    workItems.forEach(wi => {
        const date = (wi.fields['Microsoft.VSTS.Scheduling.StartDate'] || wi.fields['System.CreatedDate'] || '').split('T')[0];
        const duration = parseFloat(wi.fields['Custom.DurationInHours']) || 0;
        if (!date) return;
        if (!days[date]) days[date] = 0;
        days[date] += duration;
    });
    const sortedDates = Object.keys(days).sort();
    // Calcular cantidad de usuarios para el rango
    let userCount = 1;
    if (filters.assignedTo === 'ALL') {
        const assignedUsers = loadAssignedUsersFromLocal();
        userCount = assignedUsers.length || 1;
    }
    const sparkLogged = sortedDates.map(d => days[d]);
    const sparkExpected = sortedDates.map(() => 9 * userCount); // 9h/día por usuario
    const sparkDiff = sparkLogged.map((v, i) => v - sparkExpected[i]);
    const sparkEffectiveness = sparkLogged.map((v, i) => sparkExpected[i] > 0 ? Math.round((v / sparkExpected[i]) * 100) : 0);
    // 7. Gráfico de línea: evolución semanal
    // (ya calculado arriba)
    // 8. Actualizar KPIs y gráficos
    setKPIValues({
        expected: summary.expectedHours,
        logged: summary.totalHours,
        diff: summary.totalHours - summary.expectedHours,
        effectiveness: Math.round(summary.effectiveness * 10) / 10
    });
    renderSparklines({
        sparkExpected,
        sparkLogged,
        sparkDiff,
        sparkEffectiveness
    });
    renderBarUsers(userNames, userHours);
    renderRadialCompliance(Math.round(summary.effectiveness * 10) / 10);
    renderLineHours(sparkExpected, sparkLogged, sortedDates);
    // 9. Gráficos adicionales: horas por AreaPath y actividad
    // Horas por AreaPath (solo Tasks, agrupando por System.AreaPath)
    const areaMap = {};
    workItems.forEach(wi => {
        if (wi.fields['System.WorkItemType'] !== 'Task') return;
        let area = wi.fields['System.AreaPath'] || 'Sin Área';
        // Tomar solo la última parte del AreaPath
        if (area.includes('\\')) {
            area = area.split('\\').pop();
        } else if (area.includes('/')) {
            area = area.split('/').pop();
        }
        const duration = parseFloat(wi.fields['Custom.DurationInHours']) || 0;
        if (!areaMap[area]) areaMap[area] = 0;
        areaMap[area] += duration;
    });
    // Top 10 áreas por horas
    const areaSummary = Object.entries(areaMap)
        .map(([area, hours]) => ({ area, hours }))
        .sort((a, b) => b.hours - a.hours)
        .slice(0, 10);
    renderProjectChart(
        areaSummary.map(item => ({ project: item.area, hours: item.hours }))
    );
    // Distribución de actividad
    const activitySummary = getActivitySummary(workItems);
    renderActivityChart(activitySummary);
}

function setKPIValues({ expected, logged, diff, effectiveness }) {
    document.getElementById("kpi-expected").textContent = expected || 0;
    document.getElementById("kpi-logged").textContent = logged || 0;
    document.getElementById("kpi-diff").textContent = diff || 0;
    document.getElementById("kpi-effectiveness").textContent = (effectiveness || 0) + "%";
}

function renderSparklines({ sparkExpected = [], sparkLogged = [], sparkDiff = [], sparkEffectiveness = [] }) {
    const sparkOptions = (data, color) => ({
        chart: {
            type: 'line',
            height: 40,
            sparkline: { enabled: true }
        },
        stroke: { width: 2 },
        series: [{ data }],
        colors: [color],
        tooltip: { enabled: false },
    });
    document.getElementById("spark-expected").innerHTML = '';
    document.getElementById("spark-logged").innerHTML = '';
    document.getElementById("spark-diff").innerHTML = '';
    document.getElementById("spark-effectiveness").innerHTML = '';
    new ApexCharts(document.querySelector("#spark-expected"), sparkOptions(sparkExpected, "#007bff")).render();
    new ApexCharts(document.querySelector("#spark-logged"), sparkOptions(sparkLogged, "#28a745")).render();
    new ApexCharts(document.querySelector("#spark-diff"), sparkOptions(sparkDiff, "#ffc107")).render();
    new ApexCharts(document.querySelector("#spark-effectiveness"), sparkOptions(sparkEffectiveness, "#17a2b8")).render();
}

function renderBarUsers(userNames, userHours) {
    const options = {
        chart: { type: 'bar', height: 300 },
        plotOptions: {
            bar: { horizontal: true, borderRadius: 4 }
        },
        series: [{
            name: 'Horas',
            data: userHours
        }],
        xaxis: {
            categories: userNames,
            labels: { style: { colors: '#fff' } }
        },
        colors: ["#007bff"],
        grid: { borderColor: '#343a40' },
        theme: { mode: 'dark' },
    };
    document.getElementById("bar-users").innerHTML = '';
    new ApexCharts(document.querySelector("#bar-users"), options).render();
}

function renderRadialCompliance(effectiveness) {
    const options = {
        chart: { type: 'radialBar', height: 300 },
        series: [effectiveness],
        labels: ['Efectividad'],
        colors: ["#17a2b8"],
        plotOptions: {
            radialBar: {
                hollow: { size: '70%' },
                dataLabels: {
                    name: { color: '#fff', fontSize: '18px' },
                    value: { color: '#fff', fontSize: '32px', show: true, formatter: v => v + "%" }
                }
            }
        },
        theme: { mode: 'dark' },
    };
    document.getElementById("radial-compliance").innerHTML = '';
    new ApexCharts(document.querySelector("#radial-compliance"), options).render();
}

function renderLineHours(sparkExpected, sparkLogged, categories) {
    const options = {
        chart: { type: 'area', height: 300, toolbar: { show: false } },
        series: [
            { name: 'Esperadas', data: sparkExpected },
            { name: 'Registradas', data: sparkLogged }
        ],
        xaxis: {
            categories: categories || [],
            labels: { style: { colors: '#fff' } }
        },
        colors: ["#007bff", "#28a745"],
        grid: { borderColor: '#343a40' },
        theme: { mode: 'dark' },
        dataLabels: { enabled: false },
        stroke: { curve: 'smooth', width: 2 },
        legend: { labels: { colors: '#fff' } },
    };
    document.getElementById("line-hours").innerHTML = '';
    new ApexCharts(document.querySelector("#line-hours"), options).render();
}

// --- HOOKS: actualizar dashboard visual al cargar y al cambiar filtro ---
document.addEventListener('DOMContentLoaded', async () => {
    // 1. Inicializar select de usuario y días libres
    const assignedUsers = loadAssignedUsersFromLocal();
    const assignedToSelect = document.getElementById('assignedTo');
    if (assignedToSelect) {
        assignedToSelect.innerHTML = '<option value="ALL">Todos los usuarios</option>' +
            assignedUsers.map(u => `<option value="${u}">${u}</option>`).join('');
        // Set valor guardado
        const filters = loadFiltersFromLocal();
        assignedToSelect.value = filters.assignedTo || 'ALL';
        assignedToSelect.addEventListener('change', () => {
            const filters = loadFiltersFromLocal();
            filters.assignedTo = assignedToSelect.value;
            saveFiltersToLocal(filters);
        });
    }
    const freeDaysInput = document.getElementById('freeDays');
    if (freeDaysInput) {
        const filters = loadFiltersFromLocal();
        freeDaysInput.value = filters.freeDays || '';
        freeDaysInput.addEventListener('change', () => {
            const filters = loadFiltersFromLocal();
            filters.freeDays = freeDaysInput.value;
            saveFiltersToLocal(filters);
        });
    }
    // 2. Configuración: si falta token/org, mostrar popup antes de cargar datos
    const config = getConfig();
    if (!config.organization || !config.pat) {
        showConfigPopup();
        return;
    }
    // 3. Flatpickr: inicializa y guarda la instancia
    let fpInstance = flatpickr("#dateRange", {
        mode: "range",
        dateFormat: "Y-m-d",
        defaultDate: [new Date(new Date().setDate(new Date().getDate() - 7)), new Date()],
        locale: {
            firstDayOfWeek: 1,
            weekdays: {
                shorthand: ["Do", "Lu", "Ma", "Mi", "Ju", "Vi", "Sa"],
                longhand: ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"],
            },
            months: {
                shorthand: ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"],
                longhand: ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"],
            },
        }
    });
    // 4. Botón de cargar: guarda filtros y recarga dashboard
    document.getElementById('loadGlobalBtn')?.addEventListener('click', () => {
        // Leer fechas directamente de flatpickr
        const selectedDates = fpInstance.selectedDates;
        let dateFrom = '', dateTo = '';
        if (selectedDates.length === 2) {
            dateFrom = selectedDates[0].toISOString().split('T')[0];
            dateTo = selectedDates[1].toISOString().split('T')[0];
        } else if (selectedDates.length === 1) {
            dateFrom = dateTo = selectedDates[0].toISOString().split('T')[0];
        }
        if (!dateFrom || !dateTo) {
            alert('Por favor selecciona un rango de fechas válido.');
            return;
        }
        // Actualizar el input visualmente
        document.getElementById('dateRange').value = `${dateFrom} a ${dateTo}`;
        const assignedTo = document.getElementById('assignedTo')?.value || 'ALL';
        const freeDays = document.getElementById('freeDays')?.value || '';
        // Guardar en localStorage
        saveFiltersToLocal({ dateFrom, dateTo, assignedTo, freeDays });
        updateDashboardVisual();
    });
    // 5. Botón de configuración
    document.getElementById('editConfigBtn')?.addEventListener('click', showConfigPopup);
    // 6. Cargar dashboard visual automáticamente (con filtros actuales)
    updateDashboardVisual();
}); 