// azureDevOpsApi.js

export async function fetchAllProjects(org, pat) {
    const url = `https://dev.azure.com/${org}/_apis/projects?api-version=7.0`;
    const res = await fetch(url, {
        headers: { 'Authorization': 'Basic ' + btoa(':' + pat) }
    });
    if (!res.ok) throw new Error('No se pudieron obtener los proyectos');
    const data = await res.json();
    return data.value || [];
}

export async function fetchWorkItemsForProject(org, project, pat, wiqlTemplate, filters) {
    // Formatea fechas
    function formatDateOnly(dateStr) {
        if (!dateStr) return '';
        return dateStr.split('T')[0];
    }
    const safeFilters = {
        ...filters,
        dateFrom: formatDateOnly(filters.dateFrom),
        dateTo: formatDateOnly(filters.dateTo)
    };
    let wiql = wiqlTemplate
        .replace(/\$\{dateFrom\}/g, safeFilters.dateFrom)
        .replace(/\$\{dateTo\}/g, safeFilters.dateTo);
    if (safeFilters.assignedTo && safeFilters.assignedTo !== 'ALL') {
        wiql += ` AND [System.AssignedTo] = '${safeFilters.assignedTo.replace(/'/g, "''")}'`;
    }
    if (!/\[System.TeamProject\]/i.test(wiql)) {
        wiql = wiql.replace(/WHERE/i, `WHERE [System.TeamProject] = '${project}' AND `);
    } else {
        wiql = wiql.replace(/\[System.TeamProject\][^A-Za-z0-9]*=[^A-Za-z0-9]*'[^']*'/i, `[System.TeamProject] = '${project}'`);
    }
    // Reemplazo extra: elimina la hora de cualquier fecha tipo 2025-06-30T23:59:59Z en el WIQL (más robusto)
    wiql = wiql.replace(/(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}:\d{2}Z/g, '$1');
    const wiqlObj = { query: wiql };
    const url = `https://dev.azure.com/${org}/${project}/_apis/wit/wiql?api-version=7.0`;
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Authorization': 'Basic ' + btoa(':' + pat), 'Content-Type': 'application/json' },
        body: JSON.stringify(wiqlObj)
    });
    if (!res.ok) {
        let errorText = await res.text();
        throw new Error(errorText || 'Error en consulta WIQL');
    }
    const data = await res.json();
    if (!data.workItems || data.workItems.length === 0) return [];
    // Obtener detalles completos
    const ids = data.workItems.map(wi => wi.id);
    const batchSize = 100;
    let allDetails = [];
    for (let i = 0; i < ids.length; i += batchSize) {
        const batchIds = ids.slice(i, i + batchSize).join(',');
        const detailsUrl = `https://dev.azure.com/${org}/_apis/wit/workitems?ids=${batchIds}&fields=System.Id,System.Title,System.WorkItemType,System.State,System.TeamProject,System.CreatedDate,Microsoft.VSTS.Scheduling.TargetDate,Microsoft.VSTS.Scheduling.StartDate,Microsoft.VSTS.Common.Activity,Custom.DurationInHours,System.Parent,System.AssignedTo&api-version=7.0`;
        const detailsRes = await fetch(detailsUrl, {
            headers: { 'Authorization': 'Basic ' + btoa(':' + pat) }
        });
        if (detailsRes.ok) {
            const detailsData = await detailsRes.json();
            allDetails = allDetails.concat(detailsData.value);
        } else {
            let errorText = await detailsRes.text();
            throw new Error(errorText || 'Error obteniendo detalles de work items');
        }
    }
    return allDetails;
}

// Puedes agregar aquí otras funciones de consulta a DevOps si las necesitas. 