/* =============================================================
   logbook.js  -- Logbook dialog UI for Late Night Radio.
   Slice 5.  Loaded after storage.js, before main.js.

   Exports: window.Logbook  (object)

   Dependencies (all globals):
     STATIONS   -- array from stations.js
     STORY      -- narrative data from story.js
     Morse      -- morse helpers from morse.js
     Dial       -- dial controller from dial.js
     Storage    -- persistence from storage.js
     window.LNR -- runtime state injected by main.js after power-on

   Public API
   ----------
   Logbook.init(getState)   -- wire all event listeners
   Logbook.refresh()        -- re-render the open logbook
   Logbook.open()           -- open the logbook dialog
================================================================ */

var Logbook = (function () {

  /* -- tiny helpers ----------------------------------------- */

  function el(tag, props, children) {
    var node = document.createElement(tag);
    if (props) {
      for (var k in props) {
        if (!Object.prototype.hasOwnProperty.call(props, k)) continue;
        if (k === 'className')        { node.className   = props[k]; }
        else if (k === 'textContent') { node.textContent = props[k]; }
        else                          { node.setAttribute(k, props[k]); }
      }
    }
    if (children) {
      for (var i = 0; i < children.length; i++) {
        if (children[i] instanceof Node) node.appendChild(children[i]);
      }
    }
    return node;
  }

  function formatDate(iso) {
    try {
      var d = new Date(iso);
      if (isNaN(d.getTime())) return '';
      var hh = ('0' + d.getHours()).slice(-2);
      var mm = ('0' + d.getMinutes()).slice(-2);
      var mo = ['Jan','Feb','Mar','Apr','May','Jun',
                'Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()];
      return d.getDate() + '\u00a0' + mo + '\u00a0' + d.getFullYear() +
             ' at ' + hh + ':' + mm;
    } catch (e) { return ''; }
  }

  var TYPE_LABELS = { music: 'music', morse: 'Morse', fragment: 'fragment' };

  /* -- module state ----------------------------------------- */

  var _getState  = null;
  var _openBtnEl = null;

  function state() { return _getState ? _getState() : {}; }

  /* -- build one station row -------------------------------- */

  function buildStationRow(station) {
    var s         = state();
    var isMorse   = station.type === 'morse';
    var isFound   = !!s.found[station.id];
    var isDecoded = !!s.decoded[station.id];

    var row = el('li', {
      className: 'lb-row' + (isFound ? ' lb-row--found' : ' lb-row--unknown')
    });

    if (!isFound) {
      row.setAttribute('aria-label', 'Unknown signal');
      row.appendChild(el('span', { className: 'lb-unknown-label',
                                   textContent: 'Unknown signal' }));
      row.appendChild(el('span', { className: 'lb-freq-unknown',
                                   textContent: '---.--' }));
      return row;
    }

    var header = el('div', { className: 'lb-row-header' });
    header.appendChild(el('h3', { className: 'lb-station-name',
                                  textContent: station.name }));
    var meta = el('div', { className: 'lb-meta' });
    meta.appendChild(el('span', {
      className: 'lb-freq',
      textContent: station.frequency.toFixed(1) + '\u00a0MHz'
    }));
    meta.appendChild(el('span', {
      className  : 'lb-type lb-type--' + station.type,
      textContent: TYPE_LABELS[station.type] || station.type
    }));
    var foundDate = s.found[station.id];
    if (foundDate) {
      var fmt = formatDate(foundDate);
      if (fmt) {
        meta.appendChild(el('span', { className: 'lb-found-date',
                                      textContent: 'Found ' + fmt }));
      }
    }
    header.appendChild(meta);
    row.appendChild(header);

    var storyData = (typeof STORY !== 'undefined') ? STORY.getData(station.id) : null;
    if (isMorse && !isDecoded) {
      var dots = (typeof Morse !== 'undefined') ? Morse.toString(station.content) : '';
      row.appendChild(el('p', { className: 'lb-morse-raw', textContent: dots }));
      row.appendChild(el('p', {
        className  : 'lb-not-decoded',
        textContent: 'Not decoded yet \u2014 tune in and listen carefully.'
      }));
    } else if (storyData) {
      if (isMorse) {
        row.appendChild(el('p', { className: 'lb-caption',
                                  textContent: storyData.caption }));
        row.appendChild(el('p', {
          className  : 'lb-transcript',
          textContent: '\u201c' + station.content + '\u201d'
        }));
      } else {
        row.appendChild(el('p', { className: 'lb-caption',
                                  textContent: storyData.caption }));
      }
      row.appendChild(el('p', { className: 'lb-clue',
                                textContent: storyData.clue }));
    }

    var freq    = station.frequency;
    var tuneBtn = el('button', {
      className  : 'lb-tune-btn',
      type       : 'button',
      textContent: 'Tune to ' + freq.toFixed(1) + '\u00a0MHz'
    });
    tuneBtn.setAttribute('aria-label',
      'Tune the dial to ' + station.name + ' at ' + freq.toFixed(1) + ' MHz');
    tuneBtn.addEventListener('click', function () {
      if (typeof Dial !== 'undefined') Dial.setFrequency(freq);
      closeLogbook();
    });
    row.appendChild(tuneBtn);
    return row;
  }

  /* -- render logbook --------------------------------------- */

  function renderLogbook() {
    var dialog = document.getElementById('logbook-dialog');
    if (!dialog) return;
    var s = state();

    var foundCount = 0, decodedCount = 0, morseTotal = 0;
    for (var i = 0; i < STATIONS.length; i++) {
      if (s.found[STATIONS[i].id]) foundCount++;
      if (STATIONS[i].type === 'morse') {
        morseTotal++;
        if (s.decoded[STATIONS[i].id]) decodedCount++;
      }
    }

    var summaryEl = dialog.querySelector('.lb-summary');
    if (summaryEl) {
      var txt = foundCount + ' of 8 signals found';
      if (morseTotal > 0) {
        txt += ', ' + decodedCount + ' of ' + morseTotal + ' messages decoded';
      }
      summaryEl.textContent = txt;
      summaryEl.setAttribute('aria-label', txt);
    }

    var listEl = dialog.querySelector('.lb-station-list');
    if (listEl) {
      listEl.innerHTML = '';
      for (var j = 0; j < STATIONS.length; j++) {
        listEl.appendChild(buildStationRow(STATIONS[j]));
      }
    }

    var endingBtn = dialog.querySelector('.lb-ending-btn');
    if (endingBtn) endingBtn.hidden = !s.epilogueSeen;
  }

  /* -- open / close logbook --------------------------------- */

  function openLogbook() {
    var dialog = document.getElementById('logbook-dialog');
    if (!dialog) return;
    renderLogbook();
    dialog.hidden = false;
    document.body.style.overflow = 'hidden';
    var closeBtn = dialog.querySelector('.lb-close-btn');
    if (closeBtn) setTimeout(function () { closeBtn.focus(); }, 10);
  }

  function closeLogbook() {
    var dialog = document.getElementById('logbook-dialog');
    if (!dialog) return;
    dialog.hidden = true;
    document.body.style.overflow = '';
    if (_openBtnEl) _openBtnEl.focus();
  }

  /* -- open / close reset-confirm --------------------------- */

  function openResetConfirm() {
    var dialog = document.getElementById('reset-confirm-dialog');
    if (!dialog) return;
    dialog.hidden = false;
    var cancelBtn = dialog.querySelector('.reset-cancel-btn');
    if (cancelBtn) setTimeout(function () { cancelBtn.focus(); }, 10);
  }

  function closeResetConfirm(returnToLogbook) {
    var dialog = document.getElementById('reset-confirm-dialog');
    if (!dialog) return;
    dialog.hidden = true;
    if (returnToLogbook) {
      openLogbook();
    } else {
      if (_openBtnEl) _openBtnEl.focus();
    }
  }

  /* -- focus trap ------------------------------------------- */

  function trapFocus(dlg, e) {
    if (e.key !== 'Tab') return;
    var focusable = Array.prototype.slice.call(
      dlg.querySelectorAll(
        'button:not([disabled]),[href],input:not([disabled]),' +
        'select:not([disabled]),textarea:not([disabled]),' +
        '[tabindex]:not([tabindex="-1"])'
      )
    ).filter(function (n) { return n.offsetParent !== null; });
    if (!focusable.length) return;
    var first = focusable[0], last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault(); last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault(); first.focus();
    }
  }

  /* -- init ------------------------------------------------- */

  function init(getState) {
    _getState = getState;

    var openBtn = document.getElementById('logbook-btn');
    if (openBtn) {
      _openBtnEl = openBtn;
      openBtn.addEventListener('click', openLogbook);
    }

    var lbDialog = document.getElementById('logbook-dialog');
    if (lbDialog) {
      var lbClose = lbDialog.querySelector('.lb-close-btn');
      if (lbClose) lbClose.addEventListener('click', closeLogbook);

      lbDialog.addEventListener('click', function (e) {
        if (e.target === lbDialog) closeLogbook();
      });
      lbDialog.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { e.stopPropagation(); closeLogbook(); }
        else trapFocus(lbDialog, e);
      });

      var endingBtn = lbDialog.querySelector('.lb-ending-btn');
      if (endingBtn) {
        endingBtn.addEventListener('click', function () {
          closeLogbook();
          if (window.LNR && typeof window.LNR.showFinale === 'function') {
            window.LNR.showFinale();
          }
        });
      }

      var resetBtn = lbDialog.querySelector('.lb-reset-btn');
      if (resetBtn) {
        resetBtn.addEventListener('click', function () {
          closeLogbook();
          openResetConfirm();
        });
      }
    }

    var rcDialog = document.getElementById('reset-confirm-dialog');
    if (rcDialog) {
      var cancelBtn = rcDialog.querySelector('.reset-cancel-btn');
      if (cancelBtn) {
        cancelBtn.addEventListener('click', function () { closeResetConfirm(true); });
      }
      var confirmBtn = rcDialog.querySelector('.reset-confirm-btn');
      if (confirmBtn) {
        confirmBtn.addEventListener('click', function () {
          closeResetConfirm(false);
          if (window.LNR && typeof window.LNR.resetAll === 'function') {
            window.LNR.resetAll();
          }
        });
      }
      rcDialog.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { e.stopPropagation(); closeResetConfirm(true); }
        else trapFocus(rcDialog, e);
      });
      rcDialog.addEventListener('click', function (e) {
        if (e.target === rcDialog) closeResetConfirm(true);
      });
    }
  }

  /* -- public API ------------------------------------------- */

  return {
    init   : init,
    refresh: renderLogbook,
    open   : openLogbook,
    close  : closeLogbook
  };

}());
