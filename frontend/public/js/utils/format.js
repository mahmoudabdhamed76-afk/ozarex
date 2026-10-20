/* js/utils/format.js — pure helpers: local dates, record ids, money/number formatting, HTML escaping, Arabic search normalisation
   Phase 7: moved verbatim from the inline app script of index.html (no code changes). A classic script:
   it must load at exactly this point of index.html — see docs/FRONTEND-LOAD-ORDER.md. */
// local calendar date (was UTC → records after midnight were dated to the previous day in Egypt)
function dateStr(d) { return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0,10); }
function daysAgo(n) { const d = new Date(); d.setDate(d.getDate() - n); return d; }
/* Phase 1 · I10: record ids are random UUIDs (crypto), not 8 Math.random characters.
   crypto.randomUUID needs https; on plain http (LAN / Synology) getRandomValues still works. */
function uid() {
  try { if (window.crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID(); } catch (_) {}
  try { const a = crypto.getRandomValues(new Uint8Array(16)); return Array.from(a, b => b.toString(16).padStart(2, '0')).join(''); } catch (_) {}
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 12);
}
function fmt(n) { return Number(n||0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtCurrency(n) { return fmt(n) + ' ' + (DB.data.settings.currency || 'ج'); }
function todayStr() { return dateStr(new Date()); }
function escapeHtml(s) { return String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

/* Arabic text normalization for tolerant search
   Handles common spelling variations:
   - أ إ آ ٱ → ا (alif variations)
   - ة → ه (taa marbuta)
   - ى → ي (alif maqsura)
   - ؤ ئ → و ي
   - removes diacritics (ً ٌ ٍ َ ُ ِ ّ ْ)
   - removes tatweel ـ
   - collapses extra spaces
*/
function normalizeArabic(s) {
  if (!s) return '';
  return String(s)
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, '')      // diacritics & superscript alef
    .replace(/\u0640/g, '')                      // tatweel
    .replace(/[إأآٱ]/g, 'ا')                     // all alif variants → ا
    .replace(/ة/g, 'ه')                          // taa marbuta → haa
    .replace(/ى/g, 'ي')                          // alif maqsura → yaa
    .replace(/ؤ/g, 'و')                          // waw with hamza → waw
    .replace(/ئ/g, 'ي')                          // yaa with hamza → yaa
    .replace(/ء/g, '')                           // standalone hamza
    .replace(/\s+/g, ' ')                        // collapse spaces
    .trim();
}
