/* js/core/store.js — DB: the in-memory data store (load from the offline copy, save = record-level ops to the server, reset) + old backup stubs
   Phase 7: moved verbatim from the inline app script of index.html (no code changes). A classic script:
   it must load at exactly this point of index.html — see docs/FRONTEND-LOAD-ORDER.md. */
const DB = {
  data: {
    users: [], customers: [], products: [], invoices: [],
    payments: [], expenses: [], stockMoves: [], issuances: [],
    bankTransfers: [], suppliers: [], supplierPayments: [],
    notes: [], auditLog: [], employees: [], salaryRuns: [],
    settings: {},
    counters: { invoice: 1000, issuance: 1000, purchase: 1000 }
  },

  _bootstrapped: false,
  _bootstrapData: null,

  load() {
    if (this._bootstrapData) {
      this.data = this._bootstrapData;
      const keys = ['users','customers','products','invoices','payments','expenses','stockMoves','issuances','bankTransfers','suppliers','supplierPayments','notes','auditLog','employees','salaryRuns'];
      for (const k of keys) if (!Array.isArray(this.data[k])) this.data[k] = [];
      if (!this.data.settings) this.data.settings = {};
      if (!this.data.counters) this.data.counters = { invoice: 1000, issuance: 1000, purchase: 1000 };
      if (!this.data.counters.issuance) this.data.counters.issuance = 1000;
      if (!this.data.counters.purchase) this.data.counters.purchase = 1000;
      this.data.customers.forEach(c => { if (!c.customPrices) c.customPrices = {}; });
      return true;
    }
    return false;
  },

  _saveTimer: null,
  _saveInflight: false,
  _savePending: false,

  save() {
    try { applyBrand(); } catch (e) {}
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this._flush(), 250);
    return true;
  },

  async _flush() {
    this._saveTimer = null;
    if (this._saveInflight) { this._savePending = true; return; }
    this._saveInflight = true;
    try {
      await OfflineManager.trySave(this.data);
      window.__lastSaveOk = Date.now();
    } catch (e) {
      console.error('Save failed:', e);
      SyncEngine.onSaveError(e);
    } finally {
      this._saveInflight = false;
      if (this._savePending) { this._savePending = false; this._flush(); }
    }
  },

  snapshot() { return null; },
  listBackups() { return []; },
  rotateBackups() {},
  removeOldestBackup() {},
  recoverFromBackup() { return false; },

  async reset() {
    try {
      await fetch(API_BASE + '/api/reset', { method: 'POST' });
      const r = await fetch(API_BASE + '/api/data');
      this._bootstrapData = await r.json();
      this.load();
    } catch (e) { console.error('Reset failed:', e); }
  }
};
