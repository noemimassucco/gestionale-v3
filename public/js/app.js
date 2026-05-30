// ═══════════════════════════════════════════════════════════
// app.js — Initialization entry point (loaded last)
// ═══════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
  // ── LOGIN FORM ──
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', (e) => { e.preventDefault(); doLogin(); });
  }

  // ── KEYBOARD SHORTCUTS ──
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeCtx?.();
      document.querySelectorAll('.overlay.open').forEach(m => m.classList.remove('open'));
    }
    // Ctrl+K → global search
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      document.getElementById('global-search')?.focus();
    }
  });

  // ── OVERLAY CLICK TO CLOSE ──
  document.querySelectorAll('.overlay').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.remove('open');
    });
  });

  // ── SIDEBAR OVERLAY (mobile) ──
  const sidebarOverlay = document.getElementById('sidebar-overlay');
  if (sidebarOverlay) {
    sidebarOverlay.addEventListener('click', toggleSidebar);
  }

  // ── SESSION CHECK & INIT ──
  initApp();
});
