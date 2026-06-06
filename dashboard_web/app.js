const DATA_URL = "../data/processed/entregas_por_app.csv";
const DAILY_URL = "../data/processed/resumo_diario.csv";
const STORAGE_KEY = "motoboy-bi-extra-entries";
const EXPENSE_STORAGE_KEY = "motoboy-bi-expenses";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const compactNumber = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const numberFmt = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const dateFmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" });
const chartTextColor = "#a9bdcf";
const chartGridColor = "rgba(143, 163, 183, 0.14)";

let baseRows = [];
let baseDailyRows = [];
let extraRows = [];
let expenseRows = [];
let expectedDay = 0;
let minimumDay = 0;
let latestMonthKey = "";
let dailyChart;
let monthlyChart;
let apiAvailable = false;
let editingEntryIndex = null;
let editingExpenseIndex = null;

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const headers = lines.shift().split(",").map((header) => header.trim().replace(/^\uFEFF/, ""));
  return lines.map((line) => {
    const values = line.split(",");
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });
}

function toNumber(value) {
  let text = String(value ?? "").trim().replace(/R\$/g, "").replace(/\s/g, "");
  if (text.includes(",")) text = text.replace(/\./g, "").replace(",", ".");
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

function compactBrl(value) {
  if (Math.abs(value) >= 1000) return `R$ ${compactNumber.format(value / 1000)} mil`;
  return `R$ ${compactNumber.format(value)}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalize(row) {
  return {
    data: row.data,
    app: row.app,
    horas: toNumber(row.horas_trabalhadas ?? row.horas),
    kmDia: toNumber(row.km_dia_total ?? row.kmDia),
    corridas: toNumber(row.corridas),
    kmApp: toNumber(row.km_app ?? row.kmApp),
    receita: toNumber(row.receita_app ?? row.receita),
  };
}

function getExtraRows() {
  return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
}

function setExtraRows(rows) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
}

function getExpenses() {
  return JSON.parse(localStorage.getItem(EXPENSE_STORAGE_KEY) || "[]");
}

function setExpenses(rows) {
  localStorage.setItem(EXPENSE_STORAGE_KEY, JSON.stringify(rows));
}

async function fetchJson(url, options) {
  const response = await fetch(url, { cache: "no-store", ...options });
  if (!response.ok) throw new Error(`Erro ${response.status} em ${url}`);
  return response.json();
}

async function loadLocalData() {
  try {
    const [entries, expenses] = await Promise.all([fetchJson("/api/entries"), fetchJson("/api/expenses")]);
    apiAvailable = true;
    extraRows = entries;
    expenseRows = expenses;
  } catch {
    apiAvailable = false;
    extraRows = getExtraRows();
    expenseRows = getExpenses();
  }
}

async function reloadSavedData() {
  await loadLocalData();
  buildPeriodFilter([...baseRows, ...extraRows].map(normalize));
}

async function saveEntry(entry) {
  if (apiAvailable) {
    const saved = await fetchJson("/api/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry),
    });
    extraRows = [...extraRows, saved];
  } else {
    extraRows = [...extraRows, entry];
    setExtraRows(extraRows);
  }
}

async function replaceEntries(rows) {
  if (apiAvailable) {
    extraRows = await fetchJson("/api/entries", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rows),
    });
  } else {
    extraRows = rows;
    setExtraRows(extraRows);
  }
}

async function saveExpense(expense) {
  if (apiAvailable) {
    const saved = await fetchJson("/api/expenses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(expense),
    });
    expenseRows = [...expenseRows, saved];
  } else {
    expenseRows = [...expenseRows, expense];
    setExpenses(expenseRows);
  }
}

async function replaceExpenses(rows) {
  if (apiAvailable) {
    expenseRows = await fetchJson("/api/expenses", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rows),
    });
  } else {
    expenseRows = rows;
    setExpenses(expenseRows);
  }
}

async function clearLocalData() {
  if (apiAvailable) {
    await fetchJson("/api/reset-local", { method: "POST" });
  }
  extraRows = [];
  expenseRows = [];
  setExtraRows([]);
  setExpenses([]);
}

function monthKey(dateText) {
  const date = new Date(`${dateText}T00:00:00`);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key) {
  const [year, month] = key.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

function selectedPeriod() {
  return document.querySelector("#periodFilter").value;
}

function inSelectedPeriod(row) {
  const period = selectedPeriod();
  if (period === "all") return true;
  const target = period === "latest" ? latestMonthKey : period;
  return monthKey(row.data) === target;
}

function aggregateDaily(rows) {
  const map = new Map();
  rows.forEach((row) => {
    const key = row.data;
    if (!map.has(key)) {
      map.set(key, { data: row.data, apps: [], horas: row.horas, kmDia: row.kmDia, corridas: 0, receita: 0 });
    }
    const item = map.get(key);
    if (row.app && !item.apps.includes(row.app)) item.apps.push(row.app);
    item.horas = Math.max(item.horas, row.horas);
    item.kmDia = Math.max(item.kmDia, row.kmDia);
    item.corridas += row.corridas;
    item.receita += row.receita;
  });
  return [...map.values()]
    .map((row) => ({
      ...row,
      app: row.apps.join(" + "),
      metaDia: expectedDay,
    }))
    .sort((a, b) => a.data.localeCompare(b.data));
}

function aggregateApps(rows) {
  const map = new Map();
  rows.forEach((row) => {
    if (!map.has(row.app)) map.set(row.app, { app: row.app, receita: 0, corridas: 0, km: 0 });
    const item = map.get(row.app);
    item.receita += row.receita;
    item.corridas += row.corridas;
    item.km += row.kmApp;
  });
  return [...map.values()].sort((a, b) => b.receita - a.receita);
}

function aggregateMonthly(rows) {
  const map = new Map();
  rows.forEach((row) => {
    const date = new Date(`${row.data}T00:00:00`);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    if (!map.has(key)) {
      map.set(key, { key, label: date.toLocaleDateString("pt-BR", { month: "short", year: "numeric" }), receita: 0 });
    }
    map.get(key).receita += row.receita;
  });
  return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
}

function filteredRows() {
  const app = document.querySelector("#appFilter").value;
  const allRows = [...baseRows, ...extraRows].map(normalize);
  const periodRows = allRows.filter(inSelectedPeriod);
  return app === "todos" ? periodRows : periodRows.filter((row) => row.app === app);
}

function filteredExpenseRows() {
  return expenseRows.filter(inSelectedPeriod);
}

function updateKpis(rows, daily) {
  const revenue = rows.reduce((sum, row) => sum + row.receita, 0);
  const expenses = filteredExpenseRows().reduce((sum, row) => sum + toNumber(row.valor), 0);
  const netRevenue = revenue - expenses;
  const hours = daily.reduce((sum, row) => sum + row.horas, 0);
  const km = daily.reduce((sum, row) => sum + row.kmDia, 0);
  const days = daily.length;
  const expectedRevenue = expectedDay * days;
  const minimumRevenue = minimumDay * days;
  const dates = daily.map((row) => new Date(`${row.data}T00:00:00`));

  document.querySelector("#kpiRevenue").textContent = brl.format(revenue);
  document.querySelector("#kpiExpenses").textContent = brl.format(expenses);
  document.querySelector("#kpiNetRevenue").textContent = brl.format(netRevenue);
  document.querySelector("#kpiMinimumDay").textContent = brl.format(minimumDay);
  document.querySelector("#kpiExpectedDay").textContent = brl.format(expectedDay);
  document.querySelector("#kpiMinimumRevenue").textContent = brl.format(minimumRevenue);
  document.querySelector("#kpiExpectedRevenue").textContent = brl.format(expectedRevenue);
  document.querySelector("#kpiMinimumHour").textContent = brl.format(minimumDay / 4);
  document.querySelector("#kpiExpectedHour").textContent = brl.format(expectedDay / 4);
  document.querySelector("#kpiDays").textContent = String(days);
  document.querySelector("#kpiHours").textContent = numberFmt.format(hours);
  document.querySelector("#kpiAvgHours").textContent = numberFmt.format(days ? hours / days : 0);
  document.querySelector("#kpiAvgDay").textContent = brl.format(days ? revenue / days : 0);
  document.querySelector("#kpiHour").textContent = brl.format(hours ? revenue / hours : 0);
  document.querySelector("#kpiKm").textContent = brl.format(km ? revenue / km : 0);
  updateMetricColor("#kpiRevenue", revenue, minimumRevenue, expectedRevenue);
  updateMetricColor("#kpiNetRevenue", netRevenue, minimumRevenue, expectedRevenue);
  updateMetricColor("#kpiAvgDay", days ? revenue / days : 0, minimumDay, expectedDay);
  updateMetricColor("#kpiHour", hours ? revenue / hours : 0, minimumDay / 4, expectedDay / 4);
  updateMetricColor("#kpiKm", km ? revenue / km : 0, minimumDay / 100, expectedDay / 100);
  updateMetricColor("#kpiHours", hours, days * 4, days * 6);
  updateMetricColor("#kpiAvgHours", days ? hours / days : 0, 4, 6);
  document.querySelector("#kpiMinimumDay").classList.add("value-mid");
  document.querySelector("#kpiExpectedDay").classList.add("value-ok");
  document.querySelector("#kpiMinimumRevenue").classList.add("value-mid");
  document.querySelector("#kpiExpectedRevenue").classList.add("value-ok");
  document.querySelector("#kpiMinimumHour").classList.add("value-mid");
  document.querySelector("#kpiExpectedHour").classList.add("value-ok");
  updatePerformanceRow("#perfDaily", daily.length ? revenue / days : 0, minimumDay, expectedDay);
  updatePerformanceRow("#perfRevenue", revenue, minimumRevenue, expectedRevenue);
  updatePerformanceRow("#perfHour", hours ? revenue / hours : 0, minimumDay / 4, expectedDay / 4);

  if (dates.length) {
    const minDate = dateFmt.format(new Date(Math.min(...dates)));
    const maxDate = dateFmt.format(new Date(Math.max(...dates)));
    const period = selectedPeriod();
    const label = period === "all" ? "Acumulado" : monthLabel(period === "latest" ? latestMonthKey : period);
    document.querySelector("#periodLabel").textContent = `${label} | ${minDate} a ${maxDate}`;
  } else {
    document.querySelector("#periodLabel").textContent = "Sem lancamentos";
  }

  updateProjection({ revenue, expenses, netRevenue, hours, km, days, rows });
}

function updateProjection({ revenue, expenses, netRevenue, hours, km, days, rows }) {
  const workdaysTarget = 22;
  const minimumNet = minimumDay * workdaysTarget - expenses;
  const expectedNet = expectedDay * workdaysTarget - expenses;
  const avgDailyRevenue = days ? revenue / days : 0;
  const revenuePerHour = hours ? revenue / hours : 0;
  const missingToMinimum = Math.max(0, minimumNet - netRevenue + 0.01);
  const daysNeeded = missingToMinimum > 0 && avgDailyRevenue > 0 ? Math.ceil(missingToMinimum / avgDailyRevenue) : 0;
  const hoursNeeded = missingToMinimum > 0 && revenuePerHour > 0 ? Math.ceil((missingToMinimum / revenuePerHour) * 10) / 10 : 0;
  const netStatus = getMetricStatus(netRevenue, minimumNet, expectedNet);
  const daysText = daysNeeded === 0 ? "Acima do minimo" : String(daysNeeded);
  const hoursText = hoursNeeded === 0 ? "Acima do minimo" : numberFmt.format(hoursNeeded);
  const summaryText =
    daysNeeded === 0
      ? "A receita liquida atual ja esta acima do minimo mensal projetado para 22 dias."
      : `Faltam ${brl.format(missingToMinimum)} para superar o minimo liquido mensal. No ritmo atual, seriam necessarios aproximadamente ${daysNeeded} dias ou ${numberFmt.format(hoursNeeded)} horas de trabalho.`;

  document.querySelector("#mainNetMinimum").textContent = brl.format(minimumNet);
  document.querySelector("#mainNetExpected").textContent = brl.format(expectedNet);
  document.querySelector("#mainNetReal").textContent = brl.format(netRevenue);
  document.querySelector("#mainDaysNeeded").textContent = daysText;
  document.querySelector("#mainHoursNeeded").textContent = hoursText;
  document.querySelector("#mainNetSummary").textContent = summaryText;
  document.querySelector("#projNetMinimum").textContent = brl.format(minimumNet);
  document.querySelector("#projNetExpected").textContent = brl.format(expectedNet);
  document.querySelector("#projNetReal").textContent = brl.format(netRevenue);
  document.querySelector("#projDaysNeeded").textContent = daysText;
  document.querySelector("#projHoursNeeded").textContent = hoursText;
  document.querySelector("#projDaysWorked").textContent = String(days);
  document.querySelector("#projHoursWorked").textContent = `${numberFmt.format(hours)} h`;
  document.querySelector("#projAverageHours").textContent = `${numberFmt.format(days ? hours / days : 0)} h`;
  document.querySelector("#projRevenueKm").textContent = brl.format(km ? revenue / km : 0);
  document.querySelector("#projSummary").textContent = summaryText;

  const appRevenue = aggregateApps(rows);
  document.querySelector("#projAppRevenue").innerHTML = appRevenue.length
    ? appRevenue
        .map((item) => {
          const share = revenue ? (item.receita / revenue) * 100 : 0;
          return `<article class="projection-app-card">
            <div>
              <span>${escapeHtml(item.app || "OUTRO")}</span>
              <small>${numberFmt.format(share)}% da receita</small>
            </div>
            <strong>${brl.format(item.receita)}</strong>
          </article>`;
        })
        .join("")
    : `<p class="projection-empty">Nenhuma receita por aplicativo neste periodo.</p>`;

  setStatusClass("#mainNetRealCard", netStatus);
  setStatusClass("#mainDaysNeededCard", daysNeeded === 0 ? "ok" : "bad");
  setStatusClass("#mainHoursNeededCard", hoursNeeded === 0 ? "ok" : "bad");
  setStatusClass("#projNetRealCard", netStatus);
  setStatusClass("#projDaysNeededCard", daysNeeded === 0 ? "ok" : "bad");
  setStatusClass("#projHoursNeededCard", hoursNeeded === 0 ? "ok" : "bad");
}

function setStatusClass(selector, status) {
  const element = document.querySelector(selector);
  if (!element) return;
  element.classList.toggle("status-bad", status === "bad");
  element.classList.toggle("status-mid", status === "mid");
  element.classList.toggle("status-ok", status === "ok");
}

function updateMetricColor(selector, value, minimum, expected) {
  const element = document.querySelector(selector);
  const status = getMetricStatus(value, minimum, expected);
  element.classList.toggle("value-ok", status === "ok");
  element.classList.toggle("value-mid", status === "mid");
  element.classList.toggle("value-bad", status === "bad");
}

function getMetricStatus(value, minimum, expected) {
  if (!Number.isFinite(value) || !Number.isFinite(minimum) || !Number.isFinite(expected)) return "mid";
  if (value >= expected) return "ok";
  if (value > minimum) return "mid";
  return "bad";
}

function statusColor(value, minimum, expected) {
  const status = getMetricStatus(value, minimum, expected);
  if (status === "ok") return "#19c37d";
  if (status === "mid") return "#2186ff";
  return "#ff4664";
}

function updatePerformanceRow(selector, value, minimum, expected) {
  const row = document.querySelector(selector);
  if (!row) return;
  const max = Math.max(expected * 1.25, value, 1);
  const valueRatio = Math.max(0, Math.min(1, value / max));
  const minimumRatio = Math.max(0, Math.min(1, minimum / max));
  const expectedRatio = Math.max(0, Math.min(1, expected / max));
  const status = getMetricStatus(value, minimum, expected);
  row.style.setProperty("--min-left", `${minimumRatio * 100}%`);
  row.style.setProperty("--progress-left", `${valueRatio * 100}%`);
  row.style.setProperty("--expected-left", `${expectedRatio * 100}%`);
  row.style.setProperty("--fill-width", `${valueRatio * 100}%`);
  row.classList.toggle("status-bad", status === "bad");
  row.classList.toggle("status-mid", status === "mid");
  row.classList.toggle("status-ok", status === "ok");
}

function updateCharts(rows, daily) {
  const dailyLabels = daily.map((row) => dateFmt.format(new Date(`${row.data}T00:00:00`)));
  const dailyData = daily.map((row) => row.receita);
  const monthlyRows = aggregateMonthly([...baseRows, ...extraRows].map(normalize));

  if (dailyChart) dailyChart.destroy();
  if (monthlyChart) monthlyChart.destroy();

  dailyChart = new Chart(document.querySelector("#dailyChart"), {
    type: "bar",
    data: {
      labels: dailyLabels,
      datasets: [
        {
          label: "Receita diaria",
          data: dailyData,
          backgroundColor: daily.map((row) => statusColor(row.receita, minimumDay, expectedDay)),
          borderRadius: 4,
        },
        {
          type: "line",
          label: "Minimo dia",
          data: daily.map(() => minimumDay),
          borderColor: "#2186ff",
          borderDash: [3, 4],
          borderWidth: 2,
          pointRadius: 0,
        },
        {
          type: "line",
          label: "Esperado dia",
          data: daily.map(() => expectedDay),
          borderColor: "#19c37d",
          borderDash: [6, 4],
          borderWidth: 2,
          pointRadius: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: true, position: "bottom", labels: { color: chartTextColor } },
        tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${brl.format(ctx.raw)}` } },
      },
      scales: {
        x: { ticks: { color: chartTextColor }, grid: { color: chartGridColor } },
        y: { ticks: { color: chartTextColor, callback: (value) => brl.format(value) }, grid: { color: chartGridColor } },
      },
    },
  });

  monthlyChart = new Chart(document.querySelector("#monthlyChart"), {
    type: "bar",
    data: {
      labels: monthlyRows.map((row) => row.label),
      datasets: [
        {
          label: "Receita mensal",
          data: monthlyRows.map((row) => row.receita),
          backgroundColor: "#2186ff",
          borderRadius: 4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${brl.format(ctx.raw)}` } },
      },
      scales: {
        x: { ticks: { color: chartTextColor }, grid: { color: chartGridColor } },
        y: { ticks: { color: chartTextColor, callback: (value) => brl.format(value) }, grid: { color: chartGridColor } },
      },
    },
  });
}

function updateTable(daily) {
  const localEntries = extraRows
    .map((row, index) => ({ ...normalize(row), index }))
    .filter(inSelectedPeriod)
    .sort((a, b) => String(a.data).localeCompare(String(b.data)))
    .slice(-10)
    .reverse();

  const rows = localEntries.length
    ? localEntries
    : daily
        .slice(-10)
        .reverse()
        .map((row) => ({ ...row, index: null }));

  const html = rows.length
    ? rows
        .map((row) => {
      const hour = row.horas ? row.receita / row.horas : 0;
      const isEditable = row.index !== null;
      return `<tr class="${isEditable ? "editable-row" : ""} ${row.index === editingEntryIndex ? "selected-row" : ""}" ${isEditable ? `data-entry-index="${row.index}"` : ""}>
        <td>${dateFmt.format(new Date(`${row.data}T00:00:00`))}</td>
        <td>${escapeHtml(row.app || "-")}</td>
        <td>${numberFmt.format(row.horas)}</td>
        <td>${numberFmt.format(row.corridas)}</td>
        <td>${numberFmt.format(row.kmDia)}</td>
        <td>${brl.format(row.receita)}</td>
        <td>${brl.format(hour)}</td>
        <td>${isEditable ? `<button type="button" class="table-action danger-action" data-delete-entry="${row.index}">Remover</button>` : "-"}</td>
      </tr>`;
    })
        .join("")
    : `<tr><td colspan="8">Nenhum lancamento registrado.</td></tr>`;
  document.querySelector("#dailyTable").innerHTML = html;
}

function updateExpenseTable() {
  const expenses = filteredExpenseRows()
    .map((row) => ({ ...row, index: expenseRows.indexOf(row), valor: toNumber(row.valor) }))
    .sort((a, b) => String(a.data).localeCompare(String(b.data)))
    .slice(-10)
    .reverse();

  const html = expenses.length
    ? expenses
        .map(
          (row) => `<tr class="editable-row ${row.index === editingExpenseIndex ? "selected-row" : ""}" data-expense-index="${row.index}">
            <td>${dateFmt.format(new Date(`${row.data}T00:00:00`))}</td>
            <td>${escapeHtml(row.categoria)}</td>
            <td>${escapeHtml(row.observacao || "-")}</td>
            <td>${brl.format(row.valor)}</td>
            <td><button type="button" class="table-action danger-action" data-delete-expense="${row.index}">Remover</button></td>
          </tr>`,
        )
        .join("")
    : `<tr><td colspan="5">Nenhum gasto local registrado.</td></tr>`;

  document.querySelector("#expenseTable").innerHTML = html;
}

function render() {
  const rows = filteredRows();
  const daily = aggregateDaily(rows);
  updateKpis(rows, daily);
  updateCharts(rows, daily);
  updateTable(daily);
  updateExpenseTable();
}

function buildPeriodFilter(rows) {
  const keys = [...new Set([...rows.map((row) => monthKey(row.data)), ...expenseRows.map((row) => monthKey(row.data))])]
    .filter(Boolean)
    .sort();
  latestMonthKey = keys[keys.length - 1] || "";

  const filter = document.querySelector("#periodFilter");
  const currentValue = filter.value || "latest";
  filter.innerHTML = `
    <option value="latest">Mes atual</option>
    <option value="all">Acumulado</option>
    ${keys.map((key) => `<option value="${key}">${monthLabel(key)}</option>`).join("")}
  `;
  filter.value = [...filter.options].some((option) => option.value === currentValue) ? currentValue : "latest";
}

function setEntryEditMode(index) {
  const entry = extraRows[index];
  if (!entry) return;
  const form = document.querySelector("#entryForm");
  form.elements.data.value = entry.data || "";
  form.elements.horas.value = entry.horas || "";
  form.elements.kmDia.value = entry.kmDia || "";
  form.elements.app.value = entry.app || "OUTRO";
  form.elements.corridas.value = entry.corridas || "";
  form.elements.receita.value = entry.receita || "";
  editingEntryIndex = index;
  document.querySelector("#entrySubmit").textContent = "Salvar alteracao";
  document.querySelector("#cancelEntryEdit").classList.remove("hidden");
  document.querySelector("#entryMessage").textContent = "Editando lancamento selecionado.";
  document.querySelector("#entryMessage").classList.remove("error");
  document.querySelector("#entryMessage").classList.add("success");
  form.scrollIntoView({ behavior: "smooth", block: "start" });
  render();
}

function clearEntryEditMode() {
  editingEntryIndex = null;
  document.querySelector("#entryForm").reset();
  document.querySelector("#entrySubmit").textContent = "Adicionar ao painel";
  document.querySelector("#cancelEntryEdit").classList.add("hidden");
  document.querySelector("#entryMessage").textContent = "";
  document.querySelector("#entryMessage").classList.remove("success", "error");
  render();
}

function setExpenseEditMode(index) {
  const expense = expenseRows[index];
  if (!expense) return;
  const form = document.querySelector("#expenseForm");
  form.elements.data.value = expense.data || "";
  form.elements.categoria.value = expense.categoria || "Outros";
  form.elements.valor.value = expense.valor || "";
  form.elements.observacao.value = expense.observacao || "";
  editingExpenseIndex = index;
  document.querySelector("#expenseSubmit").textContent = "Salvar alteracao";
  document.querySelector("#cancelExpenseEdit").classList.remove("hidden");
  document.querySelector("#expenseMessage").textContent = "Editando gasto selecionado.";
  document.querySelector("#expenseMessage").classList.remove("error");
  document.querySelector("#expenseMessage").classList.add("success");
  form.scrollIntoView({ behavior: "smooth", block: "start" });
  render();
}

function clearExpenseEditMode() {
  editingExpenseIndex = null;
  document.querySelector("#expenseForm").reset();
  document.querySelector("#expenseSubmit").textContent = "Adicionar gasto";
  document.querySelector("#cancelExpenseEdit").classList.add("hidden");
  document.querySelector("#expenseMessage").textContent = "";
  document.querySelector("#expenseMessage").classList.remove("success", "error");
  render();
}

function bindForm() {
  document.querySelector("#appFilter").addEventListener("change", render);
  document.querySelector("#periodFilter").addEventListener("change", render);

  document.querySelectorAll(".tab-button").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".tab-button").forEach((item) => item.classList.toggle("active", item === button));
      document.querySelectorAll(".tab-panel").forEach((panel) => panel.classList.toggle("active", panel.id === button.dataset.tab));
    });
  });

  document.querySelector("#entryForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const message = document.querySelector("#entryMessage");
    const kmDia = toNumber(form.get("kmDia"));
    const entry = {
      data: form.get("data"),
      app: form.get("app"),
      horas: toNumber(form.get("horas")),
      kmDia,
      corridas: toNumber(form.get("corridas")),
      kmApp: kmDia,
      receita: toNumber(form.get("receita")),
    };
    try {
      if (editingEntryIndex !== null) {
        const updatedRows = extraRows.map((row, index) => (index === editingEntryIndex ? entry : row));
        await replaceEntries(updatedRows);
        editingEntryIndex = null;
      } else {
        await saveEntry(entry);
      }
      await reloadSavedData();
      document.querySelector("#periodFilter").value = monthKey(entry.data);
      document.querySelector("#appFilter").value = "todos";
      event.currentTarget.reset();
      document.querySelector("#entrySubmit").textContent = "Adicionar ao painel";
      document.querySelector("#cancelEntryEdit").classList.add("hidden");
      message.textContent = "Lancamento salvo e painel atualizado.";
      message.classList.remove("error");
      message.classList.add("success");
      render();
    } catch (error) {
      message.textContent = `Nao foi possivel salvar o lancamento: ${error.message}`;
      message.classList.remove("success");
      message.classList.add("error");
    }
  });

  document.querySelector("#expenseForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const message = document.querySelector("#expenseMessage");
    const expense = {
      data: form.get("data"),
      categoria: form.get("categoria"),
      valor: toNumber(form.get("valor")),
      observacao: String(form.get("observacao") || "").trim(),
    };
    try {
      if (editingExpenseIndex !== null) {
        const updatedRows = expenseRows.map((row, index) => (index === editingExpenseIndex ? expense : row));
        await replaceExpenses(updatedRows);
        editingExpenseIndex = null;
      } else {
        await saveExpense(expense);
      }
      await reloadSavedData();
      document.querySelector("#periodFilter").value = monthKey(expense.data);
      event.currentTarget.reset();
      document.querySelector("#expenseSubmit").textContent = "Adicionar gasto";
      document.querySelector("#cancelExpenseEdit").classList.add("hidden");
      message.textContent = "Gasto salvo e painel atualizado.";
      message.classList.remove("error");
      message.classList.add("success");
      render();
    } catch (error) {
      message.textContent = `Nao foi possivel salvar o gasto: ${error.message}`;
      message.classList.remove("success");
      message.classList.add("error");
    }
  });

  document.querySelector("#dailyTable").addEventListener("click", (event) => {
    const deleteButton = event.target.closest("[data-delete-entry]");
    if (deleteButton) {
      event.stopPropagation();
      const index = Number(deleteButton.dataset.deleteEntry);
      const entry = extraRows[index];
      if (!entry) return;
      const ok = window.confirm("Remover este lancamento?");
      if (!ok) return;
      replaceEntries(extraRows.filter((_, rowIndex) => rowIndex !== index)).then(() => {
        if (editingEntryIndex === index) {
          editingEntryIndex = null;
          document.querySelector("#entryForm").reset();
          document.querySelector("#entrySubmit").textContent = "Adicionar ao painel";
          document.querySelector("#cancelEntryEdit").classList.add("hidden");
        }
        buildPeriodFilter([...baseRows, ...extraRows].map(normalize));
        document.querySelector("#entryMessage").textContent = "Lancamento removido.";
        document.querySelector("#entryMessage").classList.remove("error");
        document.querySelector("#entryMessage").classList.add("success");
        render();
      }).catch((error) => {
        document.querySelector("#entryMessage").textContent = `Nao foi possivel remover: ${error.message}`;
        document.querySelector("#entryMessage").classList.remove("success");
        document.querySelector("#entryMessage").classList.add("error");
      });
      return;
    }
    const row = event.target.closest("[data-entry-index]");
    if (!row) return;
    setEntryEditMode(Number(row.dataset.entryIndex));
  });

  document.querySelector("#expenseTable").addEventListener("click", (event) => {
    const deleteButton = event.target.closest("[data-delete-expense]");
    if (deleteButton) {
      event.stopPropagation();
      const index = Number(deleteButton.dataset.deleteExpense);
      const expense = expenseRows[index];
      if (!expense) return;
      const ok = window.confirm("Remover este gasto?");
      if (!ok) return;
      replaceExpenses(expenseRows.filter((_, rowIndex) => rowIndex !== index)).then(() => {
        if (editingExpenseIndex === index) {
          editingExpenseIndex = null;
          document.querySelector("#expenseForm").reset();
          document.querySelector("#expenseSubmit").textContent = "Adicionar gasto";
          document.querySelector("#cancelExpenseEdit").classList.add("hidden");
        }
        buildPeriodFilter([...baseRows, ...extraRows].map(normalize));
        document.querySelector("#expenseMessage").textContent = "Gasto removido.";
        document.querySelector("#expenseMessage").classList.remove("error");
        document.querySelector("#expenseMessage").classList.add("success");
        render();
      }).catch((error) => {
        document.querySelector("#expenseMessage").textContent = `Nao foi possivel remover: ${error.message}`;
        document.querySelector("#expenseMessage").classList.remove("success");
        document.querySelector("#expenseMessage").classList.add("error");
      });
      return;
    }
    const row = event.target.closest("[data-expense-index]");
    if (!row) return;
    setExpenseEditMode(Number(row.dataset.expenseIndex));
  });

  document.querySelector("#cancelEntryEdit").addEventListener("click", clearEntryEditMode);
  document.querySelector("#cancelExpenseEdit").addEventListener("click", clearExpenseEditMode);

  document.querySelector("#resetLocal").addEventListener("click", async () => {
    await clearLocalData();
    editingEntryIndex = null;
    editingExpenseIndex = null;
    buildPeriodFilter(baseRows.map(normalize));
    render();
  });
}

async function init() {
  const [response, dailyResponse] = await Promise.all([
    fetch(DATA_URL, { cache: "no-store" }),
    fetch(DAILY_URL, { cache: "no-store" }),
  ]);
  const csv = await response.text();
  const dailyCsv = await dailyResponse.text();
  baseRows = parseCsv(csv);
  baseDailyRows = parseCsv(dailyCsv);
  await loadLocalData();
  minimumDay = baseDailyRows.length ? toNumber(baseDailyRows[0].minimo_dia) : 0;
  expectedDay = baseDailyRows.length ? toNumber(baseDailyRows[0].meta_dia) : 0;
  buildPeriodFilter([...baseRows, ...extraRows].map(normalize));
  bindForm();
  render();
}

init().catch((error) => {
  document.querySelector("#periodLabel").textContent = "Erro ao carregar dados";
  console.error(error);
});
