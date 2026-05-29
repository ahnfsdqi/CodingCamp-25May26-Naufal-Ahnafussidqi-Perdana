/**
 * FinanceFlow — Neo-Brutalist Expense Tracker
 * Architecture: Centralized State Management (Single Source of Truth)
 * Storage: LocalStorage API
 * Charts: Chart.js v4 (CDN)
 */

'use strict';

/* ============================================================
   1. CONSTANTS & CONFIGURATION
   ============================================================ */
const LS_KEYS = {
  TRANSACTIONS: 'ff_transactions',
  THEME:        'ff_theme',
  BUDGET:       'ff_budget',
  SORT:         'ff_sort',
};

const ITEMS_PER_PAGE = 10;

const CATEGORY_ICONS = {
  'Salary':        '💼',
  'Freelance':     '💻',
  'Investment':    '📈',
  'Gift':          '🎁',
  'Other Income':  '💰',
  'Food & Drink':  '🍔',
  'Transport':     '🚗',
  'Shopping':      '🛍️',
  'Housing':       '🏠',
  'Health':        '💊',
  'Education':     '📚',
  'Entertainment': '🎮',
  'Utilities':     '💡',
  'Other Expense': '💸',
};

const CHART_COLORS = [
  '#FFE135','#FF6B6B','#4ECDC4','#45B7D1','#96CEB4',
  '#FFEAA7','#DDA0DD','#98D8C8','#F7DC6F','#BB8FCE',
  '#85C1E9','#82E0AA','#F1948A','#FAD7A0','#AED6F1',
];

/* ============================================================
   2. STATE — SINGLE SOURCE OF TRUTH
   ============================================================ */
const State = {
  transactions: [],
  budget:       null,
  theme:        'light',
  currentPage:  1,
  filters: {
    category: 'all',
    type:     'all',
    search:   '',
    sort:     'date-desc',
  },
  pendingDeleteId: null,
  chartInstance:   null,

  /** Load persisted state from LocalStorage */
  load() {
    try {
      const raw = localStorage.getItem(LS_KEYS.TRANSACTIONS);
      this.transactions = raw ? JSON.parse(raw) : [];
    } catch { this.transactions = []; }

    this.budget = parseFloat(localStorage.getItem(LS_KEYS.BUDGET)) || null;
    this.theme  = localStorage.getItem(LS_KEYS.THEME) || 'light';
    this.filters.sort = localStorage.getItem(LS_KEYS.SORT) || 'date-desc';
  },

  /** Persist transactions to LocalStorage */
  saveTransactions() {
    localStorage.setItem(LS_KEYS.TRANSACTIONS, JSON.stringify(this.transactions));
  },

  /** Persist budget to LocalStorage */
  saveBudget() {
    if (this.budget !== null) {
      localStorage.setItem(LS_KEYS.BUDGET, String(this.budget));
    } else {
      localStorage.removeItem(LS_KEYS.BUDGET);
    }
  },

  /** Persist theme to LocalStorage */
  saveTheme() {
    localStorage.setItem(LS_KEYS.THEME, this.theme);
  },

  /** Persist sort preference */
  saveSort() {
    localStorage.setItem(LS_KEYS.SORT, this.filters.sort);
  },
};

/* ============================================================
   3. UTILITY FUNCTIONS
   ============================================================ */

/** Generate a unique ID */
function generateId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Sanitize a string to prevent XSS */
function sanitize(str) {
  const div = document.createElement('div');
  div.textContent = String(str).trim();
  return div.innerHTML;
}

/** Format a number as Indonesian Rupiah */
function formatRupiah(amount) {
  return 'Rp ' + Math.abs(amount).toLocaleString('id-ID');
}

/** Format a date string (YYYY-MM-DD) to a readable form */
function formatDate(dateStr) {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${parseInt(d, 10)} ${months[parseInt(m, 10) - 1]} ${y}`;
}

/** Get today's date as YYYY-MM-DD */
function todayISO() {
  return new Date().toISOString().split('T')[0];
}

/** Trigger a CSS animation by toggling a class */
function triggerAnimation(el, className, duration = 500) {
  if (!el) return;
  el.classList.remove(className);
  void el.offsetWidth; // reflow
  el.classList.add(className);
  setTimeout(() => el.classList.remove(className), duration);
}

/* ============================================================
   4. TOAST NOTIFICATION SYSTEM
   ============================================================ */
const Toast = {
  container: null,

  init() {
    this.container = document.getElementById('toastContainer');
  },

  show(message, type = 'info', duration = 3000) {
    if (!this.container) return;
    const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;
    toast.setAttribute('role', 'status');
    toast.innerHTML = `<span>${icons[type] || 'ℹ️'}</span><span>${sanitize(message)}</span>`;
    this.container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('removing');
      toast.addEventListener('animationend', () => toast.remove(), { once: true });
    }, duration);
  },
};

/* ============================================================
   5. VALIDATION ENGINE
   ============================================================ */
const Validator = {
  /** Validate the add-transaction form. Returns { valid, errors } */
  validateTransaction(desc, amount, date) {
    const errors = {};

    const cleanDesc = desc.trim();
    if (!cleanDesc) {
      errors.description = 'Description is required.';
    } else if (cleanDesc.length < 2) {
      errors.description = 'Description must be at least 2 characters.';
    }

    const numAmount = parseFloat(amount);
    if (amount === '' || amount === null || amount === undefined) {
      errors.amount = 'Amount is required.';
    } else if (isNaN(numAmount)) {
      errors.amount = 'Amount must be a valid number.';
    } else if (numAmount <= 0) {
      errors.amount = 'Amount must be greater than zero.';
    } else if (numAmount > 999_999_999_999) {
      errors.amount = 'Amount is too large.';
    }

    if (!date) {
      errors.date = 'Date is required.';
    }

    return {
      valid: Object.keys(errors).length === 0,
      errors,
    };
  },

  /** Validate budget input */
  validateBudget(value) {
    const num = parseFloat(value);
    if (value === '' || value === null || value === undefined) return { valid: false, error: 'Please enter a budget amount.' };
    if (isNaN(num) || num <= 0) return { valid: false, error: 'Budget must be a positive number.' };
    if (num > 999_999_999_999) return { valid: false, error: 'Budget amount is too large.' };
    return { valid: true, error: null };
  },

  /** Display errors on the form */
  showErrors(errors) {
    this.clearErrors();
    if (errors.description) {
      const el = document.getElementById('errDescription');
      if (el) el.textContent = errors.description;
      document.getElementById('txDescription')?.classList.add('input-error');
    }
    if (errors.amount) {
      const el = document.getElementById('errAmount');
      if (el) el.textContent = errors.amount;
      document.getElementById('txAmount')?.classList.add('input-error');
    }
    if (errors.date) {
      const el = document.getElementById('errDate');
      if (el) el.textContent = errors.date;
      document.getElementById('txDate')?.classList.add('input-error');
    }
  },

  clearErrors() {
    ['errDescription', 'errAmount', 'errDate'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = '';
    });
    ['txDescription', 'txAmount', 'txDate'].forEach(id => {
      document.getElementById(id)?.classList.remove('input-error');
    });
  },
};

/* ============================================================
   6. COMPUTATION ENGINE
   ============================================================ */
const Compute = {
  /** Calculate total income, expense, and balance */
  totals() {
    let income = 0, expense = 0;
    for (const tx of State.transactions) {
      if (tx.type === 'income') income += tx.amount;
      else expense += tx.amount;
    }
    return { income, expense, balance: income - expense };
  },

  /** Get expense totals grouped by category */
  expenseByCategory() {
    const map = {};
    for (const tx of State.transactions) {
      if (tx.type === 'expense') {
        map[tx.category] = (map[tx.category] || 0) + tx.amount;
      }
    }
    return map;
  },

  /** Get current month's total expenses */
  currentMonthExpenses() {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth() + 1;
    return State.transactions
      .filter(tx => {
        if (tx.type !== 'expense') return false;
        const [ty, tm] = tx.date.split('-').map(Number);
        return ty === y && tm === m;
      })
      .reduce((sum, tx) => sum + tx.amount, 0);
  },

  /** Apply filters and sort to transactions, return filtered array */
  filteredTransactions() {
    const { category, type, search, sort } = State.filters;
    let list = [...State.transactions];

    if (category !== 'all') {
      list = list.filter(tx => tx.category === category);
    }
    if (type !== 'all') {
      list = list.filter(tx => tx.type === type);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(tx =>
        tx.description.toLowerCase().includes(q) ||
        tx.category.toLowerCase().includes(q) ||
        (tx.note && tx.note.toLowerCase().includes(q))
      );
    }

    switch (sort) {
      case 'date-desc':   list.sort((a, b) => new Date(b.date) - new Date(a.date) || b.createdAt - a.createdAt); break;
      case 'date-asc':    list.sort((a, b) => new Date(a.date) - new Date(b.date) || a.createdAt - b.createdAt); break;
      case 'amount-desc': list.sort((a, b) => b.amount - a.amount); break;
      case 'amount-asc':  list.sort((a, b) => a.amount - b.amount); break;
    }

    return list;
  },

  /** Check if a transaction is over-budget */
  isTransactionOverBudget(tx) {
    if (!State.budget || tx.type !== 'expense') return false;
    // Flag if this single transaction exceeds the budget
    if (tx.amount >= State.budget) return true;
    // Flag if cumulative category expense exceeds budget
    const catTotal = State.transactions
      .filter(t => t.type === 'expense' && t.category === tx.category)
      .reduce((s, t) => s + t.amount, 0);
    return catTotal > State.budget;
  },
};

/* ============================================================
   7. CHART ENGINE
   ============================================================ */
const ChartEngine = {
  canvas: null,
  emptyMsg: null,

  init() {
    this.canvas   = document.getElementById('spendingChart');
    this.emptyMsg = document.getElementById('chartEmpty');
  },

  /** Destroy existing chart instance safely */
  destroy() {
    if (State.chartInstance) {
      State.chartInstance.destroy();
      State.chartInstance = null;
    }
  },

  /** Render or re-render the pie chart */
  render() {
    this.destroy();

    const data = Compute.expenseByCategory();
    const labels = Object.keys(data);
    const values = Object.values(data);

    if (labels.length === 0) {
      this.canvas.style.display = 'none';
      this.emptyMsg.style.display = 'block';
      return;
    }

    this.canvas.style.display = 'block';
    this.emptyMsg.style.display = 'none';

    const isDark = State.theme === 'dark';
    const borderCol = isDark ? '#F0F0F0' : '#0D0D0D';
    const legendCol = isDark ? '#F0F0F0' : '#0D0D0D';

    State.chartInstance = new Chart(this.canvas, {
      type: 'pie',
      data: {
        labels,
        datasets: [{
          data: values,
          backgroundColor: CHART_COLORS.slice(0, labels.length),
          borderColor: borderCol,
          borderWidth: 2,
          hoverOffset: 8,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        animation: { duration: 400, easing: 'easeInOutQuart' },
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              font: { family: "'Plus Jakarta Sans', sans-serif", weight: '700', size: 11 },
              color: legendCol,
              padding: 12,
              boxWidth: 14,
              boxHeight: 14,
              borderRadius: 3,
              useBorderRadius: true,
            },
          },
          tooltip: {
            titleFont: { family: "'Share Tech Mono', monospace", size: 12 },
            bodyFont:  { family: "'Share Tech Mono', monospace", size: 12 },
            callbacks: {
              label(ctx) {
                const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                const pct   = ((ctx.parsed / total) * 100).toFixed(1);
                return ` ${formatRupiah(ctx.parsed)} (${pct}%)`;
              },
            },
            backgroundColor: isDark ? '#1E1E1E' : '#FFFFFF',
            titleColor: isDark ? '#F0F0F0' : '#0D0D0D',
            bodyColor:  isDark ? '#CCCCCC' : '#3A3A3A',
            borderColor: borderCol,
            borderWidth: 2,
            padding: 10,
          },
        },
      },
    });
  },
};

/* ============================================================
   8. UI RENDERER
   ============================================================ */
const UI = {
  /** Master sync — called after every state mutation */
  sync() {
    this.renderSummaryCards();
    this.renderBudgetBar();
    this.renderBudgetAlert();
    this.renderHistory();
    ChartEngine.render();
  },

  /** Update the 3 summary cards + balance badge */
  renderSummaryCards() {
    const { income, expense, balance } = Compute.totals();

    const balEl    = document.getElementById('totalBalance');
    const incEl    = document.getElementById('totalIncome');
    const expEl    = document.getElementById('totalExpense');
    const badgeEl  = document.getElementById('balanceBadge');
    const cardEl   = document.getElementById('balanceCard');

    if (balEl) balEl.textContent = formatRupiah(balance);
    if (incEl) incEl.textContent = formatRupiah(income);
    if (expEl) expEl.textContent = formatRupiah(expense);

    if (badgeEl) {
      if (balance > 0)      { badgeEl.textContent = '▲ Positive'; badgeEl.style.background = '#C8F7C5'; }
      else if (balance < 0) { badgeEl.textContent = '▼ Negative'; badgeEl.style.background = '#FFD3D3'; }
      else                  { badgeEl.textContent = '● Neutral';  badgeEl.style.background = ''; }
    }

    triggerAnimation(cardEl, 'pulse', 500);
  },

  /** Update the budget progress bar */
  renderBudgetBar() {
    const budgetDisplay = document.getElementById('budgetDisplay');
    const barWrap       = document.getElementById('budgetBarWrap');
    const barFill       = document.getElementById('budgetBarFill');
    const barPct        = document.getElementById('budgetBarPct');
    const budgetInput   = document.getElementById('budgetInput');

    if (!budgetDisplay) return;

    if (State.budget) {
      const monthExp = Compute.currentMonthExpenses();
      const pct      = Math.min((monthExp / State.budget) * 100, 100);
      const over     = monthExp > State.budget;

      budgetDisplay.textContent = formatRupiah(State.budget);
      if (barWrap) barWrap.style.display = 'flex';
      if (barFill) {
        barFill.style.width = pct + '%';
        barFill.classList.toggle('over', over);
      }
      if (barPct) barPct.textContent = pct.toFixed(0) + '%';
      if (budgetInput) budgetInput.value = State.budget;
    } else {
      budgetDisplay.textContent = 'Not Set';
      if (barWrap) barWrap.style.display = 'none';
      if (budgetInput) budgetInput.value = '';
    }
  },

  /** Show/hide the budget alert banner */
  renderBudgetAlert() {
    const alertEl  = document.getElementById('budgetAlert');
    const alertMsg = document.getElementById('budgetAlertMsg');
    if (!alertEl) return;

    if (State.budget) {
      const monthExp = Compute.currentMonthExpenses();
      if (monthExp > State.budget) {
        const over = formatRupiah(monthExp - State.budget);
        alertMsg.textContent = `⚠️ Monthly budget exceeded by ${over}! Review your expenses.`;
        alertEl.hidden = false;
        return;
      }
    }
    alertEl.hidden = true;
  },

  /** Render the filtered, sorted, paginated transaction list */
  renderHistory() {
    const listEl   = document.getElementById('historyList');
    const emptyEl  = document.getElementById('historyEmpty');
    const pagEl    = document.getElementById('pagination');
    if (!listEl) return;

    const filtered = Compute.filteredTransactions();
    const total    = filtered.length;
    const pages    = Math.max(1, Math.ceil(total / ITEMS_PER_PAGE));

    // Clamp current page
    if (State.currentPage > pages) State.currentPage = pages;

    const start = (State.currentPage - 1) * ITEMS_PER_PAGE;
    const slice = filtered.slice(start, start + ITEMS_PER_PAGE);

    listEl.innerHTML = '';

    if (total === 0) {
      emptyEl.hidden = false;
      pagEl.innerHTML = '';
      return;
    }

    emptyEl.hidden = true;

    for (const tx of slice) {
      listEl.appendChild(this.buildTxItem(tx));
    }

    this.renderPagination(pages, pagEl);
  },

  /** Build a single transaction list item element */
  buildTxItem(tx) {
    const li = document.createElement('li');
    li.className = 'tx-item';
    if (Compute.isTransactionOverBudget(tx)) li.classList.add('over-budget');
    li.dataset.id = tx.id;

    const icon     = CATEGORY_ICONS[tx.category] || '💳';
    const sign     = tx.type === 'income' ? '+' : '-';
    const amtClass = tx.type === 'income' ? 'income' : 'expense';
    const noteHtml = tx.note
      ? `<span class="tx-note" title="${sanitize(tx.note)}">📝 ${sanitize(tx.note)}</span>`
      : '';

    li.innerHTML = `
      <div class="tx-icon" aria-hidden="true">${icon}</div>
      <div class="tx-info">
        <div class="tx-desc" title="${sanitize(tx.description)}">${sanitize(tx.description)}</div>
        <div class="tx-meta">
          <span class="tx-cat-badge">${sanitize(tx.category)}</span>
          <span>${formatDate(tx.date)}</span>
          ${noteHtml}
        </div>
      </div>
      <div class="tx-right">
        <span class="tx-amount ${amtClass}">${sign} ${formatRupiah(tx.amount)}</span>
        <button class="tx-delete" data-id="${tx.id}" aria-label="Delete transaction: ${sanitize(tx.description)}">✕ Delete</button>
      </div>
    `;

    return li;
  },

  /** Render pagination buttons */
  renderPagination(totalPages, container) {
    container.innerHTML = '';
    if (totalPages <= 1) return;

    const createBtn = (label, page, isActive = false, isDisabled = false) => {
      const btn = document.createElement('button');
      btn.className = 'page-btn' + (isActive ? ' active' : '');
      btn.textContent = label;
      btn.disabled = isDisabled;
      btn.setAttribute('aria-label', `Page ${label}`);
      if (!isDisabled) {
        btn.addEventListener('click', () => {
          State.currentPage = page;
          UI.renderHistory();
          document.getElementById('historyTitle')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        });
      }
      return btn;
    };

    container.appendChild(createBtn('«', 1, false, State.currentPage === 1));
    container.appendChild(createBtn('‹', State.currentPage - 1, false, State.currentPage === 1));

    const range = this.pageRange(State.currentPage, totalPages);
    for (const p of range) {
      if (p === '…') {
        const span = document.createElement('span');
        span.className = 'page-btn';
        span.textContent = '…';
        span.style.cursor = 'default';
        span.style.boxShadow = 'none';
        container.appendChild(span);
      } else {
        container.appendChild(createBtn(p, p, p === State.currentPage));
      }
    }

    container.appendChild(createBtn('›', State.currentPage + 1, false, State.currentPage === totalPages));
    container.appendChild(createBtn('»', totalPages, false, State.currentPage === totalPages));
  },

  /** Generate a smart page range with ellipsis */
  pageRange(current, total) {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    const pages = [];
    pages.push(1);
    if (current > 3) pages.push('…');
    for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) pages.push(i);
    if (current < total - 2) pages.push('…');
    pages.push(total);
    return pages;
  },
};

/* ============================================================
   9. THEME ENGINE
   ============================================================ */
const ThemeEngine = {
  apply(theme) {
    State.theme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    const icon = document.getElementById('themeIcon');
    if (icon) icon.textContent = theme === 'dark' ? '☀️' : '🌙';
    State.saveTheme();
    // Re-render chart to update colors
    ChartEngine.render();
  },

  toggle() {
    this.apply(State.theme === 'light' ? 'dark' : 'light');
    Toast.show(`Switched to ${State.theme} mode`, 'info', 2000);
  },
};

/* ============================================================
   10. TRANSACTION ACTIONS
   ============================================================ */
const Actions = {
  /** Add a new transaction to state */
  addTransaction(data) {
    const tx = {
      id:          generateId(),
      description: sanitize(data.description),
      amount:      parseFloat(data.amount),
      type:        data.type,
      category:    data.category,
      date:        data.date,
      note:        data.note ? sanitize(data.note) : '',
      createdAt:   Date.now(),
    };

    State.transactions.unshift(tx);
    State.currentPage = 1;
    State.saveTransactions();
    UI.sync();

    Toast.show(`Transaction "${tx.description}" added!`, 'success');
    return tx;
  },

  /** Delete a transaction by ID */
  deleteTransaction(id) {
    const idx = State.transactions.findIndex(tx => tx.id === id);
    if (idx === -1) return;
    const tx = State.transactions[idx];
    State.transactions.splice(idx, 1);
    State.saveTransactions();
    UI.sync();
    Toast.show(`"${tx.description}" deleted.`, 'info');
  },

  /** Delete all transactions */
  clearAll() {
    State.transactions = [];
    State.currentPage  = 1;
    State.saveTransactions();
    UI.sync();
    Toast.show('All transactions cleared.', 'warning');
  },

  /** Set the monthly budget cap */
  setBudget(value) {
    State.budget = parseFloat(value);
    State.saveBudget();
    UI.renderBudgetBar();
    UI.renderBudgetAlert();
    UI.renderHistory(); // re-check over-budget highlights
    Toast.show(`Budget set to ${formatRupiah(State.budget)}`, 'success');
  },

  /** Clear the budget cap */
  clearBudget() {
    State.budget = null;
    State.saveBudget();
    UI.renderBudgetBar();
    UI.renderBudgetAlert();
    UI.renderHistory();
    Toast.show('Budget cap removed.', 'info');
  },
};

/* ============================================================
   11. MODAL CONTROLLER
   ============================================================ */
const Modal = {
  el: null,
  confirmBtn: null,
  cancelBtn: null,
  onConfirm: null,

  init() {
    this.el         = document.getElementById('confirmModal');
    this.confirmBtn = document.getElementById('modalConfirmBtn');
    this.cancelBtn  = document.getElementById('modalCancelBtn');

    this.confirmBtn?.addEventListener('click', () => {
      if (typeof this.onConfirm === 'function') this.onConfirm();
      this.close();
    });

    this.cancelBtn?.addEventListener('click', () => this.close());

    this.el?.addEventListener('click', (e) => {
      if (e.target === this.el) this.close();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !this.el?.hidden) this.close();
    });
  },

  open(bodyText, onConfirm) {
    const bodyEl = document.getElementById('modalBody');
    if (bodyEl) bodyEl.textContent = bodyText;
    this.onConfirm = onConfirm;
    if (this.el) {
      this.el.hidden = false;
      this.confirmBtn?.focus();
    }
  },

  close() {
    if (this.el) this.el.hidden = true;
    this.onConfirm = null;
  },
};

/* ============================================================
   12. EVENT HANDLERS
   ============================================================ */
function bindEvents() {

  /* ── THEME TOGGLE ── */
  document.getElementById('themeToggleBtn')?.addEventListener('click', () => {
    ThemeEngine.toggle();
  });

  /* ── ADD TRANSACTION FORM ── */
  document.getElementById('transactionForm')?.addEventListener('submit', (e) => {
    e.preventDefault();

    const desc     = document.getElementById('txDescription')?.value ?? '';
    const amount   = document.getElementById('txAmount')?.value ?? '';
    const type     = document.getElementById('txType')?.value ?? 'expense';
    const category = document.getElementById('txCategory')?.value ?? 'Other Expense';
    const date     = document.getElementById('txDate')?.value ?? '';
    const note     = document.getElementById('txNote')?.value ?? '';

    const { valid, errors } = Validator.validateTransaction(desc, amount, date);

    if (!valid) {
      Validator.showErrors(errors);
      Toast.show('Please fix the form errors.', 'error');
      return;
    }

    Validator.clearErrors();
    Actions.addTransaction({ description: desc, amount, type, category, date, note });

    // Reset form
    e.target.reset();
    document.getElementById('txDate').value = todayISO();
    document.getElementById('txDescription')?.focus();
  });

  /* ── SET BUDGET ── */
  document.getElementById('setBudgetBtn')?.addEventListener('click', () => {
    const val = document.getElementById('budgetInput')?.value ?? '';
    const { valid, error } = Validator.validateBudget(val);
    const errEl = document.getElementById('errBudget');

    if (!valid) {
      if (errEl) errEl.textContent = error;
      return;
    }
    if (errEl) errEl.textContent = '';
    Actions.setBudget(val);
  });

  /* ── CLEAR BUDGET ── */
  document.getElementById('clearBudgetBtn')?.addEventListener('click', () => {
    const errEl = document.getElementById('errBudget');
    if (errEl) errEl.textContent = '';
    Actions.clearBudget();
  });

  /* ── BUDGET INPUT ENTER KEY ── */
  document.getElementById('budgetInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('setBudgetBtn')?.click();
  });

  /* ── DELETE TRANSACTION (event delegation) ── */
  document.getElementById('historyList')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.tx-delete');
    if (!btn) return;
    const id = btn.dataset.id;
    const tx = State.transactions.find(t => t.id === id);
    if (!tx) return;

    Modal.open(
      `Delete "${tx.description}" (${formatRupiah(tx.amount)})? This cannot be undone.`,
      () => Actions.deleteTransaction(id)
    );
  });

  /* ── CLEAR ALL ── */
  document.getElementById('clearAllBtn')?.addEventListener('click', () => {
    if (State.transactions.length === 0) {
      Toast.show('No transactions to clear.', 'info');
      return;
    }
    Modal.open(
      `Delete all ${State.transactions.length} transaction(s)? This cannot be undone.`,
      () => Actions.clearAll()
    );
  });

  /* ── BUDGET ALERT DISMISS ── */
  document.getElementById('budgetAlertClose')?.addEventListener('click', () => {
    document.getElementById('budgetAlert').hidden = true;
  });

  /* ── FILTER: CATEGORY ── */
  document.getElementById('filterCategory')?.addEventListener('change', (e) => {
    State.filters.category = e.target.value;
    State.currentPage = 1;
    UI.renderHistory();
  });

  /* ── FILTER: TYPE ── */
  document.getElementById('filterType')?.addEventListener('change', (e) => {
    State.filters.type = e.target.value;
    State.currentPage = 1;
    UI.renderHistory();
  });

  /* ── SORT ORDER ── */
  document.getElementById('sortOrder')?.addEventListener('change', (e) => {
    State.filters.sort = e.target.value;
    State.currentPage = 1;
    State.saveSort();
    UI.renderHistory();
  });

  /* ── SEARCH ── */
  let searchDebounce;
  document.getElementById('searchInput')?.addEventListener('input', (e) => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
      State.filters.search = e.target.value;
      State.currentPage = 1;
      UI.renderHistory();
    }, 250);
  });
}

/* ============================================================
   13. BOOTSTRAP / INIT
   ============================================================ */
function init() {
  // Load persisted state
  State.load();

  // Apply saved theme immediately (before render to avoid flash)
  document.documentElement.setAttribute('data-theme', State.theme);
  const themeIcon = document.getElementById('themeIcon');
  if (themeIcon) themeIcon.textContent = State.theme === 'dark' ? '☀️' : '🌙';

  // Set default date to today
  const dateInput = document.getElementById('txDate');
  if (dateInput) dateInput.value = todayISO();

  // Restore sort select
  const sortSelect = document.getElementById('sortOrder');
  if (sortSelect) sortSelect.value = State.filters.sort;

  // Init subsystems
  Toast.init();
  ChartEngine.init();
  Modal.init();

  // Bind all events
  bindEvents();

  // Initial render
  UI.sync();
}

// Run on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
