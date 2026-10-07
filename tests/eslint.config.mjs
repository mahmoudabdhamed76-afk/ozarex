/* Basic lint for the whole repo (run from tests/: npm run lint).
   Rules that already pass are errors; rules the current code breaks are warnings
   and are held at today's count by lint/run-eslint.mjs (a ratchet — the number may
   only go down). Runtime code is not changed by any of this. */
import js from '@eslint/js';
import globals from 'globals';

const APP_GLOBALS = Object.fromEntries(['uid', 'userPages', 'currentUser', 'navigate', 'currentPage', 'DB', 'OfflineManager', 'SyncEngine', 'AXCore', 'closeModal', 'openCustomerForm', 'logout',
  'renderDashboard', 'renderInvoices', 'renderIssuances', 'renderPayments', 'renderCustomers', 'renderReports', 'issuanceFilters', 'AXMarker', 'AX', 'toggleSidebar', 'AXA', 'AXStmt', 'AXDeskMore', 'notify', 'AXSales', 'AXLock', 'AXGlassNav', 'can', 'todayStr', 'fmtCurrency'].map(n => [n, 'readonly']));

export default [
  { ignores: ['tests/node_modules/**', 'tests/test-results/**', 'tests/playwright-report/**', 'frontend/public/vendor/**'] },
  {
    files: ['**/*.js', '**/*.mjs'],
    ...js.configs.recommended,
    languageOptions: { ecmaVersion: 2023, sourceType: 'script', globals: { ...globals.browser, ...globals.node } },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none', varsIgnorePattern: '^_' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-redeclare': ['error', { builtinGlobals: false }],
      'no-useless-assignment': 'warn', 'no-useless-escape': 'warn', 'no-prototype-builtins': 'warn', 'no-control-regex': 'warn'
    }
  },
  /* the browser modules are classic <script>s sharing globals across 37 files — no-undef can't judge them one file at a time */
  { files: ['frontend/public/**/*.js'], rules: { 'no-undef': 'off' } },
  { files: ['**/*.mjs'], languageOptions: { sourceType: 'module' } },
  { files: ['tests/browser/**/*.mjs', 'tests/bench/page-profile.mjs', 'tests/bench/layout-probe.mjs'], languageOptions: { globals: APP_GLOBALS }, rules: { 'no-empty-pattern': 'off' } }
];
