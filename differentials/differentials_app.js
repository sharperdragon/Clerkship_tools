// ================================
  // $ Config (edit here)
  // ================================
  const PATHS = {
    PRESENTATION_LIST: './Presentation_list.json',
    BASE_DIR: './data/presentations'
  };

  const SECTION_FOLDERS = {
    'Clinical Presentations': 'clinical',
    'Biochemical Presentations': 'biochemical',
    'Hematological Presentations': 'hematological'
  };

  const ALT_CANDIDATES = {
    // For clinical: try /clinical/<slug>.json then /clinical/other/<slug>.json
    clinical: (slug) => [
      `${PATHS.BASE_DIR}/clinical/${slug}.json`,
      `${PATHS.BASE_DIR}/clinical/other/${slug}.json`
    ],
    biochemical: (slug) => [ `${PATHS.BASE_DIR}/biochemical/${slug}.json` ],
    hematological: (slug) => [ `${PATHS.BASE_DIR}/haematological/${slug}.json`, `${PATHS.BASE_DIR}/hematological/${slug}.json` ], // try both spellings
    misc: (slug) => [ `${PATHS.BASE_DIR}/misc/${slug}.json` ]
  };

  const REQUIRED_HPI = [
    'onset','progression','palliate','provoke','quality','timing','region','radiation','severity','clinical tests','other symptoms'
  ];

  // ================================
  // ! Utilities
  // ================================
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  function slugify(name) {
    return name.toLowerCase().replace(/[^a-z0-9\s-]/g,'').trim().replace(/\s+/g,'-').replace(/-+/g,'-');
  }

  function hpiCompleteness(item) {
    const hpi = item.hpi || item.symptoms || {}; // older files may use "symptoms"
    const filled = REQUIRED_HPI.every(k => Array.isArray(hpi[k]) && hpi[k].length > 0);
    return { filled, hpi };
  }

  async function fetchJSON(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(res.status + ' ' + res.statusText + ' for ' + url);
    return await res.json();
  }

  async function tryFetchAny(urls) {
    for (const u of urls) {
      try { return { data: await fetchJSON(u), path: u }; } catch (e) { /* continue */ }
    }
    throw new Error('Not found in candidates: ' + urls.join(', '));
  }

  // ================================
  // ? Load all files listed in Presentation_list.json
  // ================================
  async function loadAll() {
    setStatus('Loading list…');
    const list = await fetchJSON(PATHS.PRESENTATION_LIST);

    const entries = [];
    for (const [section, arr] of Object.entries(list)) {
      const folder = SECTION_FOLDERS[section] || 'misc';
      for (const ent of arr) {
        const name = (typeof ent === 'string') ? ent : ent.name;
        const slug = slugify(name);
        const cands = (ALT_CANDIDATES[folder] || ALT_CANDIDATES.misc)(slug);
        try {
          const { data, path } = await tryFetchAny(cands);
          entries.push({ section, folder, name, slug, path, data });
        } catch (e) {
          entries.push({ section, folder, name, slug, path: null, data: null, error: String(e) });
        }
      }
    }
    setStatus('Loaded');
    return entries;
  }

  function setStatus(text) { $('#status').textContent = text; }

  function render(entries) {
    const q = $('#q').value.trim().toLowerCase();
    const section = $('#section').value;

    const filtered = entries.filter(e => {
      if (!e.data) return false; // hide missing for main view; errors show in stats
      if (section && e.section !== section) return false;

      // search: presentation name OR any item name/system matches
      if (q) {
        const inName = e.name.toLowerCase().includes(q);
        const inItems = (e.data.items || []).some(it => (
          (it.name||'').toLowerCase().includes(q) || (it.system||'').toLowerCase().includes(q)
        ));
        if (!(inName || inItems)) return false;
      }
      return true;
    });

    $('#stats').textContent = `${filtered.length} results · ${entries.length} loaded · ` +
      `${entries.filter(e=>!e.data).length} missing files`;

    const grid = $('#grid');
    grid.innerHTML = '';

    for (const e of filtered) {
      const d = e.data;
      const items = Array.isArray(d.items) ? d.items : [];
      const noHpi = items.filter(it => !hpiCompleteness(it).filled).length;

      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
          <h3>${escapeHTML(e.name)}</h3>
          <span class="badge">${escapeHTML(e.section)}</span>
        </div>
        <div class="tags">
          <span class="pill">${items.length} etiologies</span>
        </div>
      `;

      const details = document.createElement('details');
      const sum = document.createElement('summary');
      sum.textContent = 'Show etiologies';
      details.appendChild(sum);

      const tbl = document.createElement('table');
      const thead = document.createElement('thead');
      thead.innerHTML = `<tr><th>Etiology</th><th>System</th><th>Freq</th></tr>`;
      tbl.appendChild(thead);
      const tbody = document.createElement('tbody');

      for (const it of items) {
        const tr = document.createElement('tr');
        const freq = (it.freq||'').toLowerCase();
        tr.innerHTML = `
          <td>${escapeHTML(it.name||'')}</td>
          <td>${escapeHTML(it.system||'')}</td>
          <td class="freq-${freq}">${escapeHTML(it.freq||'')}</td>
        `;
        tbody.appendChild(tr);
      }
      tbl.appendChild(tbody);
      details.appendChild(tbl);
      card.appendChild(details);

      grid.appendChild(card);
    }
    // Re-pack the masonry grid after DOM updates
    requestAnimationFrame(() => packGrid());
  }

  function escapeHTML(s){
    return (s==null? '' : String(s))
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&#39;');
  }

  // ================================
  // $ Init
  // ================================
  (async function init(){
    try {
      const entries = await loadAll();
      const state = { entries };

      // wire controls
      for (const id of ['q','section']) {
        $("#"+id).addEventListener('input', () => render(state.entries));
        $("#"+id).addEventListener('change', () => render(state.entries));
      }

      render(state.entries);
    } catch (e) {
      $('#error').textContent = String(e);
      setStatus('Error');
    }
  })();

// ! Call packGrid() after render(entries) and on window resize
function packGrid() {
  const grid = document.querySelector('.grid');
  if (!grid) return;
  const row = parseFloat(getComputedStyle(grid).gridAutoRows);  // 8
  const gap = parseFloat(getComputedStyle(grid).gap) || 0;

  grid.querySelectorAll('.card').forEach(card => {
    // reset to natural height, then measure
    card.style.gridRowEnd = '';
    const h = card.getBoundingClientRect().height;
    // rows to span = (height + gap) / (row + gap)
    const span = Math.ceil((h + gap) / (row + gap));
    card.style.gridRowEnd = `span ${span}`;
  });
}

// Example hooks:
window.addEventListener('resize', packGrid);
// render() already calls packGrid() after painting


  details.addEventListener('toggle', () => requestAnimationFrame(packGrid));

  