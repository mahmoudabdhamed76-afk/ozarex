/* js/core/api.js — storage keys and API_BASE (same-origin server address)
   Phase 7: moved verbatim from the inline app script of index.html (no code changes). A classic script:
   it must load at exactly this point of index.html — see docs/FRONTEND-LOAD-ORDER.md. */
/* =========================================================
   DATA LAYER (LocalStorage) - Robust with auto-backup rotation
========================================================= */
const STORAGE_KEY = 'erp_erp_v1';
const SESSION_KEY = 'erp_session';
const BACKUP_KEY_PREFIX = 'erp_erp_backup_';
const MAX_BACKUPS = 5;

/* =========================================================
   API_BASE — always same-origin, never a hardcoded IP/localhost.
   Uses window.location.origin + the app path prefix so requests
   go to the EXACT host the page was opened from (works behind
   reverse proxies, custom domains, HTTPS, Synology, Railway...).
========================================================= */
function detectApiBase() {
  const origin = window.location.origin; // e.g. https://erp.example.com
  const p = window.location.pathname || '/';
  const prefix = p.replace(/\/[^\/]*$/, ''); // the folder the page was opened from ('' at the root)
  return origin + prefix;
}
const API_BASE = detectApiBase();
