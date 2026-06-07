// Skills Palette — injected webview script.
// Runs inside the Claude Code panel DOM (appended to webview/index.js by the host
// extension). Wrapped in an IIFE so it never pollutes Claude's globals.
//
// It docks a list/skills button into the SHARED toolbar div (#orb-tools) in the
// footer and, on click, asks the host extension to open the Skills Palette via a
// vscode: deep link (a synthesized anchor click — the only webview→host channel a
// sandboxed page is reliably allowed to use). The status-bar item + command palette
// are the guaranteed fallback if the deep link is blocked.
(function () {
  'use strict';

  if (window.__SKILLS_PALETTE_ACTIVE__) return;
  window.__SKILLS_PALETTE_ACTIVE__ = true;

  // Authority MUST equal the manifest's "<publisher>.<name>" lowercased.
  var BASE_URI = 'vscode://orbenozio.skills-palette/open';

  var FOOTER_SEL = '[class*="inputFooter_"]';
  var MODE_BTN_SEL = '[class*="footerButtonPrimary_"]';

  function $(sel, root) { try { return (root || document).querySelector(sel); } catch (e) { return null; } }

  // Best-effort: discover the current workspace path so the host links into the
  // RIGHT project even across multiple windows. webview/index.js is a single file
  // shared by every VS Code window, so we can't template a path in — we must read
  // it at click time. Claude's sandbox doesn't expose the workspace reliably, so
  // this usually returns null; when it does, the host falls back to the FOCUSED
  // window's workspace (this window — the one the user clicked in), which is correct.
  function discoverWorkspace() {
    try {
      var hints = [
        window.__workspaceFolder,
        window.workspaceFolder,
        (window.acquireVsCodeApi && window.__vscodeState && window.__vscodeState.workspace),
      ];
      for (var i = 0; i < hints.length; i++) {
        if (typeof hints[i] === 'string' && hints[i]) return hints[i];
      }
    } catch (e) {}
    return null;
  }

  function buildUri() {
    var ws = discoverWorkspace();
    return ws ? BASE_URI + '?ws=' + encodeURIComponent(ws) : BASE_URI;
  }

  // Shared toolbar: reuse #orb-tools if present, else create + dock left of Claude's
  // native mode button (fall back to the footer end). Re-query every call — Claude
  // re-renders the footer and detaches it.
  function ensureToolbar() {
    var existing = document.getElementById('orb-tools');
    if (existing && existing.isConnected) return existing;
    var footer = $(FOOTER_SEL);
    if (!footer) return null;
    var bar = existing || document.createElement('div');
    bar.id = 'orb-tools';
    bar.style.cssText = 'display:inline-flex;align-items:center;gap:2px;';
    var modeBtn = footer.querySelector(MODE_BTN_SEL);
    var modeContainer = modeBtn ? modeBtn.parentElement : null;
    if (modeContainer && modeContainer.parentNode) {
      modeContainer.parentNode.insertBefore(bar, modeContainer);
    } else {
      footer.appendChild(bar);
    }
    return bar;
  }

  function ensureStyle() {
    if (document.getElementById('skills-palette-style')) return;
    var st = document.createElement('style');
    st.id = 'skills-palette-style';
    st.textContent =
      '#skills-palette-btn{background:transparent;border:none;cursor:pointer;' +
      'padding:3px 6px;line-height:0;vertical-align:middle;border-radius:6px;' +
      'color:#8a8a8a;opacity:.6;transition:color .15s,opacity .15s,background .15s;}' +
      '#skills-palette-btn svg{display:block;width:18px;height:18px;}' +
      '#skills-palette-btn:hover{opacity:1;color:#6ea8fe;background:rgba(110,168,254,.16);}' +
      '#skills-palette-btn.on{opacity:1;color:#6ea8fe;background:rgba(110,168,254,.22);}' +
      '#skills-palette-btn:active{transform:scale(.92);}';
    document.head.appendChild(st);
  }

  // Optimistic "lit" state: the palette lives in a separate (host-owned) webview, so
  // there is no host→button channel. The button toggles its own lit class in lockstep
  // with the strict open/close toggle on the host. (Caveat: closing the palette via
  // its editor tab can't notify the button; the next click re-syncs.)
  var paletteOn = false;
  function applyLit() {
    var b = document.getElementById('skills-palette-btn');
    if (b) {
      if (paletteOn) b.classList.add('on'); else b.classList.remove('on');
      b.setAttribute('aria-pressed', paletteOn ? 'true' : 'false');
    }
  }

  // Open via synthesized anchor click. location.href / window.open are blocked in the
  // sandboxed webview; only an <a> click reaches env.openExternal.
  function openPalette() {
    try {
      var a = document.createElement('a');
      a.href = buildUri();
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { try { a.remove(); } catch (e) {} }, 0);
    } catch (e) {
      try { window.location.href = buildUri(); } catch (e2) {}
    }
  }

  function injectButton() {
    if (document.getElementById('skills-palette-btn')) {
      var bar0 = ensureToolbar();
      var btn0 = document.getElementById('skills-palette-btn');
      if (bar0 && btn0 && btn0.parentNode !== bar0) bar0.appendChild(btn0);
      return;
    }
    var bar = ensureToolbar();
    if (!bar) return;
    ensureStyle();

    var btn = document.createElement('button');
    btn.id = 'skills-palette-btn';
    btn.type = 'button';
    btn.title = 'Open Skills Palette — link a skill from your hub to this project';
    btn.setAttribute('aria-label', 'Open Skills Palette');
    // Inline "plug" SVG (stroke via currentColor so it renders deterministically —
    // emoji render grey/inconsistently in the webview). The plug evokes the core
    // action: connecting a skill into the project.
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M12 22v-5"/><path d="M9 8V2"/><path d="M15 8V2"/>' +
      '<path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z"/></svg>';
    btn.addEventListener('mousedown', function (e) { e.preventDefault(); });
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      paletteOn = !paletteOn; // optimistic toggle, in lockstep with the host
      applyLit();
      openPalette();
    });
    bar.appendChild(btn);
    applyLit(); // re-applied on every re-inject so the lit state survives re-renders
  }

  setInterval(injectButton, 1500);
  injectButton();
})();
