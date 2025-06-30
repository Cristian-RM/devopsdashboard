// charts.js

export function renderActivityChart(activitySummary) {
    // activitySummary: [{ activity, hours }]
    const chartDiv = document.getElementById('activity-chart');
    if (!chartDiv) return;
    chartDiv.innerHTML = '';
    if (!activitySummary || activitySummary.length === 0) {
        chartDiv.innerHTML = '<div style="text-align:center;color:#888;">Sin datos de actividades</div>';
        return;
    }
    const options = {
        chart: {
            type: 'pie',
            height: 350
        },
        labels: activitySummary.map(a => a.activity),
        series: activitySummary.map(a => a.hours),
        title: { text: 'Horas por Actividad', align: 'center' },
        legend: { position: 'bottom' }
    };
    const chart = new ApexCharts(chartDiv, options);
    chart.render();
}

export function renderProjectChart(projectSummary) {
    // projectSummary: [{ project, hours }]
    const chartDiv = document.getElementById('project-chart');
    if (!chartDiv) return;
    chartDiv.innerHTML = '';
    if (!projectSummary || projectSummary.length === 0) {
        chartDiv.innerHTML = '<div style="text-align:center;color:#888;">Sin datos de proyectos</div>';
        return;
    }
    const options = {
        chart: {
            type: 'bar',
            height: 350
        },
        plotOptions: {
            bar: { horizontal: false, columnWidth: '60%' }
        },
        dataLabels: { enabled: true },
        xaxis: {
            categories: projectSummary.map(p => p.project)
        },
        series: [{ name: 'Horas', data: projectSummary.map(p => p.hours) }],
        title: { text: 'Horas por Proyecto', align: 'center' },
        legend: { show: false }
    };
    const chart = new ApexCharts(chartDiv, options);
    chart.render();
}

// Agrega aquí otras funciones de gráficos que necesites. 