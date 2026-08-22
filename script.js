const STORAGE_KEY = "tabmate-data-v1";

const els = {
  personForm: document.getElementById("person-form"),
  personName: document.getElementById("person-name"),
  peopleList: document.getElementById("people-list"),
  expenseForm: document.getElementById("expense-form"),
  expenseHeading: document.getElementById("expense-heading"),
  payer: document.getElementById("payer"),
  amount: document.getElementById("amount"),
  description: document.getElementById("description"),
  splitBoxes: document.getElementById("split-checkboxes"),
  splitHint: document.getElementById("split-hint"),
  splitToolbar: document.getElementById("split-toolbar"),
  selectAllBtn: document.getElementById("select-all-btn"),
  clearSplitBtn: document.getElementById("clear-split-btn"),
  addExpenseBtn: document.getElementById("add-expense-btn"),
  cancelEditBtn: document.getElementById("cancel-edit-btn"),
  expenseList: document.getElementById("expense-list"),
  netList: document.getElementById("net-list"),
  settlementList: document.getElementById("settlement-list"),
  copyBtn: document.getElementById("copy-btn"),
  resetBtn: document.getElementById("reset-btn"),
  toast: document.getElementById("toast"),
};

const state = {
  people: [],
  expenses: [],
  editingId: null,
};

let lastTransfers = [];
let copyTimer;

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random());
}

function money(n) {
  return new Intl.NumberFormat("uk-UA", {
    style: "currency",
    currency: "UAH",
    minimumFractionDigits: 2,
  }).format(n);
}

function formatShareAmount(n) {
  return `${n.toFixed(2).replace(".", ",")} грн`;
}

function capitalizeName(name) {
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (!trimmed) return "";
  return trimmed.charAt(0).toLocaleUpperCase("uk-UA") + trimmed.slice(1);
}

function save() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ people: state.people, expenses: state.expenses })
  );
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (Array.isArray(data.people)) state.people = data.people;
    if (Array.isArray(data.expenses)) state.expenses = data.expenses;
  } catch {
    state.people = [];
    state.expenses = [];
  }
}

let toastTimer;
function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove("show"), 2200);
}

function personName(id) {
  return state.people.find((p) => p.id === id)?.name ?? "Невідомо";
}

function splitInputs() {
  return [...els.splitBoxes.querySelectorAll("input[type='checkbox']")];
}

function setSplitChecked(ids) {
  const set = ids instanceof Set ? ids : new Set(ids);
  splitInputs().forEach((box) => {
    box.checked = set.has(box.value);
  });
}

function updateExpenseFormUi() {
  const editing = Boolean(state.editingId);
  els.expenseHeading.textContent = editing ? "Редагувати витрату" : "Нова витрата";
  els.addExpenseBtn.textContent = editing ? "Зберегти зміни" : "Додати витрату";
  els.cancelEditBtn.hidden = !editing;
}

function clearAmountAndDescription() {
  els.amount.value = "";
  els.description.value = "";
}

function exitEditMode({ keepSplit = false } = {}) {
  state.editingId = null;
  updateExpenseFormUi();
  clearAmountAndDescription();
  if (!keepSplit) {
    splitInputs().forEach((box) => {
      box.checked = true;
    });
  }
}

function renderPeople() {
  els.peopleList.innerHTML = "";
  if (!state.people.length) {
    els.peopleList.innerHTML = '<li class="empty">Поки що нікого немає.</li>';
  } else {
    state.people.forEach((person) => {
      const li = document.createElement("li");
      li.className = "chip";
      li.innerHTML = `<span></span><button type="button" class="icon-btn icon-btn-delete" aria-label="Видалити">×</button>`;
      li.querySelector("span").textContent = person.name;
      li.querySelector("button").addEventListener("click", () => removePerson(person.id));
      els.peopleList.appendChild(li);
    });
  }

  const currentPayer = els.payer.value;
  els.payer.innerHTML = '<option value="" disabled>Оберіть учасника</option>';
  state.people.forEach((person) => {
    const opt = document.createElement("option");
    opt.value = person.id;
    opt.textContent = person.name;
    els.payer.appendChild(opt);
  });
  if (state.people.some((p) => p.id === currentPayer)) {
    els.payer.value = currentPayer;
  }

  const existingBoxes = splitInputs();
  const previouslyChecked = new Set(existingBoxes.filter((i) => i.checked).map((i) => i.value));
  const hadBoxes = existingBoxes.length > 0;

  els.splitBoxes.innerHTML = "";
  if (!state.people.length) {
    els.splitHint.hidden = false;
    els.splitHint.textContent = "Спочатку додайте учасників.";
    els.splitToolbar.hidden = true;
  } else {
    els.splitHint.hidden = true;
    els.splitToolbar.hidden = false;
    state.people.forEach((person) => {
      const row = document.createElement("label");
      row.className = "check-row";
      const checked = hadBoxes ? previouslyChecked.has(person.id) : true;
      row.innerHTML = `<input type="checkbox" value="${person.id}" ${checked ? "checked" : ""}><span></span>`;
      row.querySelector("span").textContent = person.name;
      els.splitBoxes.appendChild(row);
    });
  }

  els.addExpenseBtn.disabled = state.people.length < 1;
}

function renderExpenses() {
  els.expenseList.innerHTML = "";
  if (!state.expenses.length) {
    els.expenseList.innerHTML = '<li class="empty">Витрат ще немає.</li>';
    return;
  }

  [...state.expenses].reverse().forEach((exp) => {
    const li = document.createElement("li");
    li.className = "expense-item";
    const among = exp.splitAmong.map(personName).join(", ");
    li.innerHTML = `
      <div>
        <div></div>
        <div class="expense-meta"></div>
      </div>
      <div class="expense-actions">
        <span class="amount"></span>
        <button type="button" class="icon-btn icon-btn-edit" aria-label="Редагувати витрату">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M4 20h4.5L19.2 9.3a2.12 2.12 0 0 0-3-3L5.5 16.99V20z" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M13.5 6.5l4 4" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
          </svg>
        </button>
        <button type="button" class="icon-btn icon-btn-delete" aria-label="Видалити витрату">×</button>
      </div>
    `;
    li.querySelector("div > div").textContent = (exp.description || "").trim() || "Витрата";
    li.querySelector(".expense-meta").textContent = `Платив: ${personName(exp.payerId)} · Ділять: ${among}`;
    li.querySelector(".amount").textContent = money(exp.amount);
    const [editBtn, deleteBtn] = li.querySelectorAll(".icon-btn");
    editBtn.addEventListener("click", () => startEdit(exp.id));
    deleteBtn.addEventListener("click", () => removeExpense(exp.id));
    els.expenseList.appendChild(li);
  });
}

function computeNets() {
  const nets = Object.fromEntries(state.people.map((p) => [p.id, 0]));

  state.expenses.forEach((exp) => {
    const share = exp.amount / exp.splitAmong.length;
    if (nets[exp.payerId] !== undefined) {
      nets[exp.payerId] += exp.amount;
    }
    exp.splitAmong.forEach((id) => {
      if (nets[id] !== undefined) nets[id] -= share;
    });
  });

  return nets;
}

function settle(nets) {
  const EPS = 0.005;
  const debtors = [];
  const creditors = [];

  Object.entries(nets).forEach(([id, value]) => {
    if (value < -EPS) debtors.push({ id, amount: -value });
    else if (value > EPS) creditors.push({ id, amount: value });
  });

  debtors.sort((a, b) => b.amount - a.amount);
  creditors.sort((a, b) => b.amount - a.amount);

  const transfers = [];
  let i = 0;
  let j = 0;

  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].amount, creditors[j].amount);
    if (pay > EPS) {
      transfers.push({
        from: debtors[i].id,
        to: creditors[j].id,
        amount: Math.round(pay * 100) / 100,
      });
    }
    debtors[i].amount -= pay;
    creditors[j].amount -= pay;
    if (debtors[i].amount <= EPS) i += 1;
    if (creditors[j].amount <= EPS) j += 1;
  }

  return transfers;
}

function renderBalances() {
  const nets = computeNets();
  els.netList.innerHTML = "";

  if (!state.people.length) {
    els.netList.innerHTML = '<li class="empty">Додайте учасників, щоб побачити баланс.</li>';
  } else {
    state.people.forEach((person) => {
      const value = nets[person.id] || 0;
      const li = document.createElement("li");
      li.className = "net-item";
      const cls = value > 0.005 ? "net-get" : value < -0.005 ? "net-owe" : "net-ok";
      const label =
        value > 0.005 ? `має отримати ${money(value)}` :
        value < -0.005 ? `має віддати ${money(-value)}` :
        "розраховано";
      li.innerHTML = `<span></span><span class="amount ${cls}"></span>`;
      li.querySelector("span").textContent = person.name;
      li.querySelector(".amount").textContent = label;
      els.netList.appendChild(li);
    });
  }

  const transfers = settle(nets);
  lastTransfers = transfers;
  els.settlementList.innerHTML = "";
  if (!transfers.length) {
    els.settlementList.innerHTML = '<li class="empty">Перекази не потрібні — усі в нулі.</li>';
    return;
  }

  transfers.forEach((t) => {
    const li = document.createElement("li");
    li.className = "settle-item";
    li.innerHTML = `
      <div>
        <strong></strong><span class="arrow">→</span><strong></strong>
      </div>
      <span class="amount net-owe"></span>
    `;
    const names = li.querySelectorAll("strong");
    names[0].textContent = personName(t.from);
    names[1].textContent = personName(t.to);
    li.querySelector(".amount").textContent = money(t.amount);
    els.settlementList.appendChild(li);
  });
}

function render() {
  renderPeople();
  renderExpenses();
  renderBalances();
  updateExpenseFormUi();
}

function addPerson(name) {
  const formatted = capitalizeName(name);
  if (!formatted) return;
  const exists = state.people.some((p) => p.name.toLowerCase() === formatted.toLowerCase());
  if (exists) {
    showToast("Таке ім’я вже є");
    return;
  }
  state.people.push({ id: uid(), name: formatted });
  save();
  render();
}

function removePerson(id) {
  state.people = state.people.filter((p) => p.id !== id);
  state.expenses = state.expenses.filter(
    (e) => e.payerId !== id && !e.splitAmong.includes(id)
  );
  if (state.editingId) {
    const stillExists = state.expenses.some((e) => e.id === state.editingId);
    if (!stillExists) exitEditMode({ keepSplit: true });
  }
  save();
  render();
}

function startEdit(id) {
  const exp = state.expenses.find((e) => e.id === id);
  if (!exp) return;
  state.editingId = id;
  updateExpenseFormUi();
  els.payer.value = exp.payerId;
  els.amount.value = String(exp.amount);
  els.description.value = exp.description === "Витрата" ? "" : exp.description;
  setSplitChecked(exp.splitAmong);
  document.getElementById("expense-section").scrollIntoView({ behavior: "smooth", block: "nearest" });
  els.amount.focus();
}

function addExpense({ payerId, amount, description, splitAmong }) {
  state.expenses.push({
    id: uid(),
    payerId,
    amount,
    description: description.trim() || "Витрата",
    splitAmong,
    createdAt: Date.now(),
  });
  save();
  render();
  clearAmountAndDescription();
  splitInputs().forEach((box) => {
    box.checked = true;
  });
  showToast("Витрату додано");
}

function updateExpense({ payerId, amount, description, splitAmong }) {
  const exp = state.expenses.find((e) => e.id === state.editingId);
  if (!exp) return;
  exp.payerId = payerId;
  exp.amount = amount;
  exp.description = description.trim() || "Витрата";
  exp.splitAmong = splitAmong;
  state.editingId = null;
  save();
  render();
  clearAmountAndDescription();
  splitInputs().forEach((box) => {
    box.checked = true;
  });
  showToast("Витрату оновлено");
}

function removeExpense(id) {
  if (state.editingId === id) exitEditMode({ keepSplit: true });
  state.expenses = state.expenses.filter((e) => e.id !== id);
  save();
  render();
  showToast("Витрату видалено");
}

function buildShareText() {
  const lines = ["Табмейт розрахунок:"];
  if (!lastTransfers.length) {
    lines.push("Усі рахунки зійшлись.");
  } else {
    lastTransfers.forEach((t) => {
      lines.push(`• ${personName(t.from)} ➔ ${personName(t.to)}: ${formatShareAmount(t.amount)}`);
    });
  }
  return lines.join("\n");
}

async function copySettlement() {
  const text = buildShareText();
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    area.remove();
  }
  const original = "Скопіювати розрахунок";
  els.copyBtn.textContent = "Скопійовано!";
  els.copyBtn.classList.add("is-copied");
  clearTimeout(copyTimer);
  copyTimer = setTimeout(() => {
    els.copyBtn.textContent = original;
    els.copyBtn.classList.remove("is-copied");
  }, 2000);
}

els.personForm.addEventListener("submit", (e) => {
  e.preventDefault();
  addPerson(els.personName.value);
  els.personName.value = "";
  els.personName.focus();
});

els.expenseForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const payerId = els.payer.value;
  const amount = Number(els.amount.value);
  const description = els.description.value;
  const splitAmong = splitInputs().filter((i) => i.checked).map((i) => i.value);

  if (!payerId || !(amount > 0)) {
    showToast("Оберіть, хто платив, і вкажіть суму");
    return;
  }
  if (!splitAmong.length) {
    showToast("Оберіть хоча б одного учасника");
    return;
  }

  const payload = { payerId, amount, description, splitAmong };
  if (state.editingId) updateExpense(payload);
  else addExpense(payload);
});

els.selectAllBtn.addEventListener("click", () => {
  splitInputs().forEach((box) => {
    box.checked = true;
  });
});

els.clearSplitBtn.addEventListener("click", () => {
  splitInputs().forEach((box) => {
    box.checked = false;
  });
});

els.cancelEditBtn.addEventListener("click", () => {
  exitEditMode();
});

els.copyBtn.addEventListener("click", () => {
  copySettlement();
});

els.resetBtn.addEventListener("click", () => {
  const ok = window.confirm("Ви впевнені, що хочете видалити всі дані?");
  if (!ok) return;
  state.people = [];
  state.expenses = [];
  state.editingId = null;
  localStorage.removeItem(STORAGE_KEY);
  render();
  clearAmountAndDescription();
  showToast("Дані очищено");
});

load();
render();
