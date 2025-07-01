import { fetchWorkItemsForProject } from './azureDevOpsApi.js';
import { transformTaskTableRows } from './dataTransform.js';

// --- Utilidades ---
function getConfig() {
    try { return JSON.parse(localStorage.getItem('devopsConfig')) || {}; } catch { return {}; }
}
function loadFiltersFromLocal() {
    try { return JSON.parse(localStorage.getItem('filters') || '{}'); } catch { return {}; }
}
function saveFiltersToLocal(filters) {
    localStorage.setItem('filters', JSON.stringify(filters));
}
function loadAssignedUsersFromLocal() {
    try { return JSON.parse(localStorage.getItem('assignedUsers') || '[]'); } catch { return []; }
}

// --- Filtros y flatpickr ---
function getCurrentWeekRange() {
    const today = new Date();
    const day = today.getDay();
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((day + 6) % 7));
    const friday = new Date(monday);
    friday.setDate(monday.getDate() + 4);
    return [monday, friday];
}

// --- Inicialización de flatpickr con persistencia ---
let filtersFromLocal = loadFiltersFromLocal();
let defaultDates = [];
if (filtersFromLocal.dateFrom && filtersFromLocal.dateTo) {
    // Si ya hay fechas guardadas, úsalas
    defaultDates = [new Date(filtersFromLocal.dateFrom), new Date(filtersFromLocal.dateTo)];
} else {
    // Si no hay fechas guardadas, sugiere la semana actual
    defaultDates = getCurrentWeekRange();
    filtersFromLocal.dateFrom = defaultDates[0].toISOString().split('T')[0];
    filtersFromLocal.dateTo = defaultDates[1].toISOString().split('T')[0];
    saveFiltersToLocal(filtersFromLocal);
}
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

// --- Inicializar select de usuario y días libres ---
const assignedUsers = loadAssignedUsersFromLocal();
const assignedToSelect = document.getElementById('assignedTo');
if (assignedToSelect) {
    assignedToSelect.innerHTML = '<option value="ALL">Todos los usuarios</option>' +
        assignedUsers.map(u => `<option value="${u}">${u}</option>`).join('');
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

// --- Botón de configuración ---
document.getElementById('editConfigBtn')?.addEventListener('click', () => {
    window.location.href = 'index.html'; // O puedes abrir el popup si lo prefieres
});

// --- Botón de cargar ---
document.getElementById('loadTasksBtn')?.addEventListener('click', loadAndRenderTasks);

// --- Búsqueda ---
document.getElementById('searchInput')?.addEventListener('input', filterTable);

// --- Exportar ---
document.getElementById('exportBtn')?.addEventListener('click', exportTableToCSV);

// --- Variables de paginación ---
let currentPage = 1;
const rowsPerPage = 20;
let allTableRows = [];

// --- Cargar y renderizar tareas ---
async function loadAndRenderTasks() {
    const config = getConfig();
    if (!config.organization || !config.pat) {
        alert('Falta configuración de DevOps');
        return;
    }
    // Leer fechas de flatpickr
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
    const assignedTo = document.getElementById('assignedTo')?.value || 'ALL';
    const freeDays = document.getElementById('freeDays')?.value || '';
    saveFiltersToLocal({ dateFrom, dateTo, assignedTo, freeDays });
    document.getElementById('tasks-table-container').innerHTML = '<div class="loading">Cargando tareas...</div>';
    try {
        const wiqlTemplate = config.wiql || `SELECT [System.Id], [System.Title], [System.WorkItemType], [System.State], [System.TeamProject], [System.CreatedDate], [Microsoft.VSTS.Scheduling.TargetDate], [Microsoft.VSTS.Scheduling.StartDate], [Microsoft.VSTS.Common.Activity], [Custom.DurationInHours], [System.Parent] FROM WorkItems WHERE [Microsoft.VSTS.Scheduling.TargetDate] >= '${'${dateFrom}'}' AND [Microsoft.VSTS.Scheduling.TargetDate] <= '${'${dateTo}'}'`;
        const project = config.project || 'Devops System Process';
        const workItems = await fetchWorkItemsForProject(config.organization, project, config.pat, wiqlTemplate, { dateFrom, dateTo, assignedTo, freeDays });
        const tableRows = transformTaskTableRows(workItems);
        allTableRows = tableRows;
        currentPage = 1;
        renderTasksTablePage();
    } catch (e) {
        document.getElementById('tasks-table-container').innerHTML = `<div class="error">${e.message}</div>`;
    }
}

// --- Renderizar tabla con paginación ---
function renderTasksTablePage() {
    const org = getConfig().organization;
    const rows = allTableRows;
    if (!rows || rows.length === 0) {
        document.getElementById('tasks-table-container').innerHTML = '<div class="error">Sin tareas en el rango seleccionado.</div>';
        return;
    }
    const startIdx = (currentPage - 1) * rowsPerPage;
    const endIdx = Math.min(startIdx + rowsPerPage, rows.length);
    const pageRows = rows.slice(startIdx, endIdx);
    let html = `<table id="tasks-table" class="table table-dark table-striped table-hover table-bordered" style="width:100%;border-radius:1rem;overflow:hidden;">
        <thead>
            <tr>
                <th>Área</th>
                <th>Título</th>
                <th>Duración (h)</th>
                <th>Costo (USD)</th>
                <th>Start Date</th>
                <th>Target Date</th>
                <th>Activity</th>
            </tr>
        </thead>
        <tbody>
            ${pageRows.map(row => `
                <tr>
                    <td>${row.areaPath ? row.areaPath.split('\\').pop() : ''}</td>
                    <td><a href="${row.url ? row.url : `https://dev.azure.com/${org}/${row.project}/_workitems/edit/${row.id}`}" target="_blank" style="color:#4fd1c5;text-decoration:underline;">${row.title}</a></td>
                    <td>${row.duration.toFixed(2)}</td>
                    <td>$${row.cost.toFixed(2)}</td>
                    <td>${row.start}</td>
                    <td>${row.target}</td>
                    <td>${row.activity}</td>
                </tr>
            `).join('')}
        </tbody>
    </table>`;
    html += renderPaginationControls(rows.length);
    document.getElementById('tasks-table-container').innerHTML = html;
}

// --- Controles de paginación ---
function renderPaginationControls(totalRows) {
    const totalPages = Math.ceil(totalRows / rowsPerPage);
    if (totalPages <= 1) return '';
    let controls = `<nav aria-label="Paginación de tareas"><ul class="pagination justify-content-center">`;
    controls += `<li class="page-item${currentPage === 1 ? ' disabled' : ''}"><a class="page-link" href="#" onclick="return changePage(${currentPage - 1})">Anterior</a></li>`;
    for (let i = 1; i <= totalPages; i++) {
        if (i === currentPage) {
            controls += `<li class="page-item active"><span class="page-link">${i}</span></li>`;
        } else if (i === 1 || i === totalPages || Math.abs(i - currentPage) <= 2) {
            controls += `<li class="page-item"><a class="page-link" href="#" onclick="return changePage(${i})">${i}</a></li>`;
        } else if (i === currentPage - 3 || i === currentPage + 3) {
            controls += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
        }
    }
    controls += `<li class="page-item${currentPage === totalPages ? ' disabled' : ''}"><a class="page-link" href="#" onclick="return changePage(${currentPage + 1})">Siguiente</a></li>`;
    controls += `</ul></nav>`;
    return controls;
}

// --- Cambiar página ---
window.changePage = function(page) {
    const totalPages = Math.ceil(allTableRows.length / rowsPerPage);
    if (page < 1 || page > totalPages) return false;
    currentPage = page;
    renderTasksTablePage();
    return false;
}

// --- Búsqueda en la tabla (solo página actual) ---
function filterTable() {
    const input = document.getElementById('searchInput').value.toLowerCase();
    const table = document.getElementById('tasks-table');
    if (!table) return;
    for (let row of table.tBodies[0].rows) {
        let show = false;
        for (let cell of row.cells) {
            if (cell.textContent.toLowerCase().includes(input)) show = true;
        }
        row.style.display = show ? '' : 'none';
    }
}

// --- Exportar a CSV (solo página actual) ---
function exportTableToCSV() {
    const table = document.getElementById('tasks-table');
    if (!table) return;
    let csv = [];
    for (let row of table.rows) {
        let rowData = [];
        for (let cell of row.cells) {
            let text = cell.textContent.replace(/\n/g, ' ').replace(/"/g, '""');
            rowData.push('"' + text + '"');
        }
        csv.push(rowData.join(','));
    }
    const csvContent = csv.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'tareas.csv';
    link.click();
}

// --- Cargar tabla al abrir la página ---
loadAndRenderTasks(); 