// dataTransform.js

export function getDashboardSummary(workItems, filters) {
    // Parámetros y constantes
    const COSTO_HORA = 39.29;
    const { dateFrom, dateTo, freeDays = [], assignedTo = 'ALL' } = filters || {};
    // Lista de desarrolladores (debe coincidir con BASE_ASSIGNED_USERS en main.js)
    const DEVELOPERS = [
        "Alexander Tejada <alexander.tejada@lascatalinascr.com>",
        "Cristian Rodriguez <cristian.rodriguez@lascatalinascr.com>",
        "Francisco Lopez <francisco.lopez@lascatalinascr.com>",
        "Jennifer Corrales <jennifer.corrales@lascatalinascr.com>",
        "Joshua Hernandez <joshua.hernandez@lascatalinascr.com>",
        "Luis Rodriguez <luis.rodriguez@lascatalinascr.com>",
        "Santiago Paniagua <santiago.paniagua@lascatalinascr.com>"
    ];
    // Calcular días hábiles
    function getBusinessDays(start, end, freeDaysArr = []) {
        const startDate = new Date(start);
        const endDate = new Date(end);
        let count = 0;
        for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
            const day = d.getDay();
            const dateStr = d.toISOString().split('T')[0];
            if (day !== 0 && day !== 6 && !freeDaysArr.includes(dateStr)) count++;
        }
        return count;
    }
    // Sumar horas totales
    let totalHours = 0;
    let projectMap = {};
    let activityMap = {};
    workItems.forEach(wi => {
        const duration = parseFloat(wi.fields['Custom.DurationInHours']) || 0;
        totalHours += duration;
        // Por proyecto
        const project = wi.fields['System.TeamProject'] || 'Sin Proyecto';
        if (!projectMap[project]) projectMap[project] = 0;
        projectMap[project] += duration;
        // Por actividad
        const activity = wi.fields['Microsoft.VSTS.Common.Activity'] || 'Sin Actividad';
        if (!activityMap[activity]) activityMap[activity] = 0;
        activityMap[activity] += duration;
    });
    // Horas esperadas
    let expectedHours = 0;
    let businessDays = 0;
    if (dateFrom && dateTo) {
        businessDays = getBusinessDays(dateFrom, dateTo, freeDays);
        // Si es "ALL", multiplicar por el número de desarrolladores
        const developerCount = assignedTo === 'ALL' ? DEVELOPERS.length : 1;
        expectedHours = businessDays * 9 * developerCount; // 9 horas por día hábil por desarrollador
    }
    // Efectividad
    const effectiveness = expectedHours > 0 ? (totalHours / expectedHours) * 100 : 0;
    // Promedio diario
    const avgPerDay = businessDays > 0 ? totalHours / businessDays : 0;
    // Costo
    const totalCost = totalHours * COSTO_HORA;
    // HTML de proyectos
    const projectListHtml = Object.entries(projectMap).map(([project, hours]) => `<li><b>${project}:</b> ${hours.toFixed(2)} h</li>`).join('');
    // Resumen de actividades para el gráfico
    const activitySummary = Object.entries(activityMap).map(([activity, hours]) => ({ activity, hours }));
    return {
        totalHours,
        expectedHours,
        effectiveness,
        avgPerDay,
        costoHora: COSTO_HORA,
        totalCost,
        projectListHtml,
        activitySummary
    };
}

export function groupByProject(workItems) {
    // Devuelve un objeto { [proyecto]: [array de workItems] }
    return workItems.reduce((acc, wi) => {
        const project = wi.fields['System.TeamProject'] || 'Sin Proyecto';
        if (!acc[project]) acc[project] = [];
        acc[project].push(wi);
        return acc;
    }, {});
}

export function getActivitySummary(workItems) {
    // Devuelve un array de objetos { activity, hours, count }
    const map = {};
    workItems.forEach(wi => {
        const activity = wi.fields['Microsoft.VSTS.Common.Activity'] || 'Sin Actividad';
        const duration = parseFloat(wi.fields['Custom.DurationInHours']) || 0;
        if (!map[activity]) map[activity] = { activity, hours: 0, count: 0 };
        map[activity].hours += duration;
        map[activity].count += 1;
    });
    return Object.values(map);
}

export function transformTaskTableRows(workItems) {
    const wiMap = {};
    workItems.forEach(wi => { wiMap[wi.id] = wi; });
    return workItems.map(wi => {
        let epic = '', pbi = '';
        let parentId = wi.fields['System.Parent'];
        let parent = parentId ? wiMap[parentId] : null;
        if (parent) {
            if (parent.fields['System.WorkItemType'] === 'Product Backlog Item') {
                pbi = parent.fields['System.Title'];
                let epicId = parent.fields['System.Parent'];
                let epicItem = epicId ? wiMap[epicId] : null;
                if (epicItem && epicItem.fields['System.WorkItemType'] === 'Epic') {
                    epic = epicItem.fields['System.Title'];
                }
            } else if (parent.fields['System.WorkItemType'] === 'Epic') {
                epic = parent.fields['System.Title'];
            }
        }
        if (wi.fields['System.WorkItemType'] === 'Product Backlog Item') {
            pbi = wi.fields['System.Title'];
            let epicId = wi.fields['System.Parent'];
            let epicItem = epicId ? wiMap[epicId] : null;
            if (epicItem && epicItem.fields['System.WorkItemType'] === 'Epic') {
                epic = epicItem.fields['System.Title'];
            }
        } else if (wi.fields['System.WorkItemType'] === 'Epic') {
            epic = wi.fields['System.Title'];
        }
        const duration = parseFloat(wi.fields['Custom.DurationInHours']) || 0;
        return {
            project: wi.fields['System.TeamProject'],
            epic,
            pbi,
            title: wi.fields['System.Title'],
            id: wi.id,
            url: wi.url || '',
            areaPath: wi.fields['System.AreaPath'] || '',
            duration: duration,
            start: wi.fields['Microsoft.VSTS.Scheduling.StartDate'] || wi.fields['System.CreatedDate'] ? (wi.fields['Microsoft.VSTS.Scheduling.StartDate'] || wi.fields['System.CreatedDate']).split('T')[0] : '',
            target: wi.fields['Microsoft.VSTS.Scheduling.TargetDate'] || wi.fields['System.ChangedDate'] ? (wi.fields['Microsoft.VSTS.Scheduling.TargetDate'] || wi.fields['System.ChangedDate']).split('T')[0] : '',
            activity: wi.fields['Microsoft.VSTS.Common.Activity'] || '',
            cost: duration * 39.29 // COSTO_HORA fijo aquí, o pásalo como parámetro si prefieres
        };
    });
}

// Agrega aquí otras funciones de transformación/calculo que necesites. 