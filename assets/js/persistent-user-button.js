(function () {
  'use strict';

  var STORAGE_KEY   = 'vita_session';
  var TTL_MS        = 8 * 60 * 60 * 1000;
  var PASSPORT_HREF = 'https://glasshaus-universe.replit.app/passport';

  function getSession() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var s = JSON.parse(raw);
      if (!s || !s.established_at) return null;
      if (Date.now() - s.established_at > TTL_MS) {
        localStorage.removeItem(STORAGE_KEY);
        return null;
      }
      return s;
    } catch (e) { return null; }
  }

  var SVG = {
    user:
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"' +
      ' stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
      '<circle cx="12" cy="8" r="4"/>' +
      '<path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>',

    chevron:
      '<svg class="pub-chevron" width="13" height="13" viewBox="0 0 24 24" fill="none"' +
      ' stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"' +
      ' style="transition:transform 0.2s ease;flex-shrink:0;">' +
      '<polyline points="6 9 12 15 18 9"/></svg>',

    shield:
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"' +
      ' stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',

    logout:
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"' +
      ' stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>' +
      '<polyline points="16 17 21 12 16 7"/>' +
      '<line x1="21" y1="12" x2="9" y2="12"/></svg>'
  };

  function esc(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function PersistentUserButton(mountEl) {
    this.mount    = mountEl;
    this.session  = getSession();
    this.isOpen   = false;
    this.btn      = null;
    this.dropdown = null;
    this._build();
  }

  PersistentUserButton.prototype._build = function () {
    var self = this;
    var s    = self.session;

    var btn = document.createElement('button');
    btn.setAttribute('aria-haspopup', 'true');
    btn.setAttribute('aria-expanded', 'false');
    btn.style.cssText =
      'display:inline-flex;align-items:center;gap:6px;' +
      'padding:6px 12px 6px 10px;border-radius:2rem;' +
      'border:none;cursor:pointer;' +
      'background:rgba(0,0,0,0.06);' +
      'transition:background 0.15s ease;' +
      'font-family:inherit;flex-shrink:0;' +
      'position:relative;z-index:2;';

    var btnHTML = '';
    if (s && s.avatar) {
      btnHTML +=
        '<img src="' + esc(s.avatar) + '"' +
        ' style="width:22px;height:22px;border-radius:50%;object-fit:cover;flex-shrink:0;" alt="">';
    } else {
      btnHTML +=
        '<span style="color:#2D1F3D;display:flex;align-items:center;">' + SVG.user + '</span>';
    }
    if (s && s.name) {
      btnHTML +=
        '<span style="font-family:\'DM Sans\',sans-serif;font-size:0.75rem;font-weight:400;' +
        'color:#2D1F3D;letter-spacing:0.02em;white-space:nowrap;' +
        'max-width:110px;overflow:hidden;text-overflow:ellipsis;">' + esc(s.name) + '</span>';
    }
    btnHTML += '<span style="color:#2D1F3D;display:flex;align-items:center;">' + SVG.chevron + '</span>';
    btn.innerHTML = btnHTML;

    btn.addEventListener('mouseenter', function () {
      btn.style.background = 'rgba(0,0,0,0.11)';
    });
    btn.addEventListener('mouseleave', function () {
      if (!self.isOpen) btn.style.background = 'rgba(0,0,0,0.06)';
    });
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      self.isOpen ? self.close() : self.open();
    });

    var headerTitle = s ? esc(s.name || 'Member') : 'Guest';
    var headerSub   = s ? 'Flourish Member' : 'Not yet synced';

    var dropHTML =
      '<div style="padding:14px 16px 12px;border-bottom:0.5px solid rgba(107,79,168,0.12);">' +
        '<div style="font-size:0.87rem;font-weight:500;color:#2D1F3D;letter-spacing:0.01em;">' + headerTitle + '</div>' +
        '<div style="font-size:0.71rem;color:rgba(45,31,61,0.5);margin-top:2px;letter-spacing:0.02em;">' + headerSub + '</div>' +
      '</div>' +
      '<a href="' + PASSPORT_HREF + '" target="_blank" rel="noopener noreferrer"' +
        ' style="display:flex;align-items:center;gap:9px;padding:11px 16px;' +
        'color:#2D1F3D;text-decoration:none;font-size:0.82rem;letter-spacing:0.01em;' +
        'transition:background 0.12s;"' +
        ' onmouseenter="this.style.background=\'rgba(107,79,168,0.07)\'"' +
        ' onmouseleave="this.style.background=\'\'">' +
        '<span style="color:#6B4FA8;display:flex;">' + SVG.shield + '</span>Your Passport' +
      '</a>';

    if (s) {
      dropHTML +=
        '<div style="border-top:0.5px solid rgba(107,79,168,0.12);padding:4px 0;">' +
          '<button id="pub-clear-btn" style="display:flex;align-items:center;gap:9px;' +
            'padding:10px 16px;width:100%;background:none;border:none;cursor:pointer;' +
            'color:rgba(45,31,61,0.58);font-size:0.82rem;letter-spacing:0.01em;' +
            'font-family:inherit;transition:background 0.12s,color 0.12s;"' +
            ' onmouseenter="this.style.background=\'rgba(200,40,40,0.07)\';this.style.color=\'#b52b2b\'"' +
            ' onmouseleave="this.style.background=\'\';this.style.color=\'rgba(45,31,61,0.58)\'">' +
            '<span style="display:flex;">' + SVG.logout + '</span>Clear Session' +
          '</button>' +
        '</div>';
    }

    var dropdown = document.createElement('div');
    dropdown.style.cssText =
      'position:fixed;min-width:210px;' +
      'background:rgba(255,255,255,0.98);' +
      'border-radius:12px;' +
      'box-shadow:0 8px 32px rgba(45,26,74,0.18),0 2px 8px rgba(45,26,74,0.10);' +
      'border:0.5px solid rgba(107,79,168,0.18);' +
      'overflow:hidden;z-index:9999;' +
      'opacity:0;transform:translateY(-6px) scale(0.97);' +
      'transition:opacity 0.15s ease,transform 0.15s ease;' +
      'pointer-events:none;' +
      'font-family:\'DM Sans\',sans-serif;';
    dropdown.innerHTML = dropHTML;
    document.body.appendChild(dropdown);

    if (s) {
      var clearBtn = dropdown.querySelector('#pub-clear-btn');
      if (clearBtn) {
        clearBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          self.close();
          localStorage.removeItem(STORAGE_KEY);
          location.reload();
        });
      }
    }

    dropdown.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () { self.close(); });
    });

    document.addEventListener('mousedown', function (e) {
      if (self.isOpen &&
          !self.mount.contains(e.target) &&
          !self.dropdown.contains(e.target)) {
        self.close();
      }
    });

    self.btn      = btn;
    self.dropdown = dropdown;
    self.mount.appendChild(btn);
  };

  PersistentUserButton.prototype._position = function () {
    var rect  = this.btn.getBoundingClientRect();
    var right = window.innerWidth - rect.right;
    this.dropdown.style.top   = (rect.bottom + 6) + 'px';
    this.dropdown.style.right = Math.max(right, 8) + 'px';
    this.dropdown.style.left  = 'auto';
  };

  PersistentUserButton.prototype.open = function () {
    var self = this;
    self.isOpen = true;
    self._position();
    self.btn.setAttribute('aria-expanded', 'true');
    self.btn.style.background = 'rgba(0,0,0,0.11)';
    var chevron = self.btn.querySelector('.pub-chevron');
    if (chevron) chevron.style.transform = 'rotate(180deg)';
    self.dropdown.style.pointerEvents = 'auto';
    requestAnimationFrame(function () {
      self.dropdown.style.opacity   = '1';
      self.dropdown.style.transform = 'translateY(0) scale(1)';
    });
  };

  PersistentUserButton.prototype.close = function () {
    var self = this;
    self.isOpen = false;
    self.btn.setAttribute('aria-expanded', 'false');
    self.btn.style.background = 'rgba(0,0,0,0.06)';
    var chevron = self.btn.querySelector('.pub-chevron');
    if (chevron) chevron.style.transform = 'rotate(0deg)';
    self.dropdown.style.opacity       = '0';
    self.dropdown.style.transform     = 'translateY(-6px) scale(0.97)';
    self.dropdown.style.pointerEvents = 'none';
  };

  function mount() {
    document.querySelectorAll('.pub-mount').forEach(function (el) {
      new PersistentUserButton(el);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
}());
