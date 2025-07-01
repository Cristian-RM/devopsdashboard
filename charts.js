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
    const colors = [
        '#007bff', '#28a745', '#ffc107', '#17a2b8', '#e83e8c', '#fd7e14', '#6f42c1', '#20c997', '#343a40', '#6610f2'
    ];
    const options = {
        chart: {
            type: 'pie',
            height: 350
        },
        labels: activitySummary.map(a => a.activity),
        series: activitySummary.map(a => a.hours),
        colors,
        title: { text: 'Horas por Actividad', align: 'center' },
        legend: { position: 'bottom', labels: { colors: '#fff' } },
        tooltip: {
            theme: 'dark',
            style: { fontSize: '15px', color: '#fff' },
            fillSeriesColor: false,
            marker: { show: true }
        }
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
    const colors = [
        '#007bff', '#28a745', '#ffc107', '#17a2b8', '#e83e8c', '#fd7e14', '#6f42c1', '#20c997', '#343a40', '#6610f2'
    ];
    const options = {
        chart: {
            type: 'bar',
            height: 350
        },
        plotOptions: {
            bar: { horizontal: false, columnWidth: '60%' }
        },
        dataLabels: { enabled: true, style: { colors: ['#fff'] } },
        xaxis: {
            categories: projectSummary.map(p => p.project),
            labels: { style: { colors: '#fff' } }
        },
        series: [{ name: 'Horas', data: projectSummary.map(p => p.hours) }],
        colors,
        title: { text: 'Horas por Proyecto', align: 'center', style: { color: '#fff' } },
        legend: { show: false },
        grid: { borderColor: '#343a40' },
        tooltip: {
            theme: 'dark',
            style: { fontSize: '15px', color: '#fff' },
            fillSeriesColor: false,
            marker: { show: true }
        }
    };
    const chart = new ApexCharts(chartDiv, options);
    chart.render();
}

// Agrega aquí otras funciones de gráficos que necesites. 