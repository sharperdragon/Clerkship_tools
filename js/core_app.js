// core_app.js
// Central app state & persistence (e.g. theme, user preferences)

(function(global){
  const STORAGE_KEY = 'clerkship_tools_settings';

  // Default settings
  const DEFAULTS = {
    theme: 'dark',   // 'dark' or 'light'
    hideLocked: true,
    showEmpty: false,
    section: ''      // section filter
  };

  function load(){
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if(!raw) return {...DEFAULTS};
      const parsed = JSON.parse(raw);
      return {...DEFAULTS, ...parsed};
    } catch(e){
      console.warn('Settings load failed', e);
      return {...DEFAULTS};
    }
  }

  function save(settings){
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch(e){
      console.warn('Settings save failed', e);
    }
  }

  // Apply theme directly to <html>
  function applyTheme(theme){
    if(theme === 'light') {
      document.documentElement.setAttribute('data-theme','light');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }

  // Public API
  const CoreApp = {
    settings: load(),
    save(){ save(this.settings); },
    reset(){ this.settings = {...DEFAULTS}; this.save(); },
    applyTheme(){ applyTheme(this.settings.theme); },
    toggleTheme(){
      this.settings.theme = (this.settings.theme === 'light') ? 'dark' : 'light';
      this.save();
      this.applyTheme();
    }
  };

  // Apply theme on load
  CoreApp.applyTheme();

  // Expose globally
  global.CoreApp = CoreApp;

})(window);

const settingsButton = document.getElementById('settings-button');
const settingsPanel = document.getElementById('settings-panel');
const closeSettings = document.getElementById('close-settings');

settingsButton.addEventListener('click', () => {
  settingsPanel.classList.add('open');
});

closeSettings.addEventListener('click', () => {
  settingsPanel.classList.remove('open');
});

document.addEventListener('click', (e) => {
  if (settingsPanel.classList.contains('open') && !settingsPanel.contains(e.target) && e.target !== settingsButton) {
    settingsPanel.classList.remove('open');
  }
});

// --- Settings side-panel wiring
// ? Close the panel when clicking outside the sheet (overlay/background) or the page
// ! Wrapped in DOMContentLoaded so it doesn't run before elements exist
document.addEventListener('DOMContentLoaded', () => {
  const settingsButton = document.getElementById('settings-button');
  const settingsPanel  = document.getElementById('settings-panel');
  const closeSettings  = document.getElementById('close-settings');
  const panelContent   = settingsPanel ? settingsPanel.querySelector('.settings-panel-content') : null;

  // Guard if the page doesn't have the side panel (other pages can include core_app.js)
  if (!settingsButton || !settingsPanel || !closeSettings || !panelContent) return;

  // Open the drawer
  settingsButton.addEventListener('click', (e) => {
    e.stopPropagation();
    settingsPanel.classList.add('open');
  });

  // Close via the X button
  closeSettings.addEventListener('click', (e) => {
    e.stopPropagation();
    settingsPanel.classList.remove('open');
  });

  // Close when clicking the overlay/background area inside the panel
  // (The overlay is implemented via ::before, so clicks land on settingsPanel; close if click is NOT inside the content sheet.)
  settingsPanel.addEventListener('click', (e) => {
    if (!panelContent.contains(e.target)) {
      settingsPanel.classList.remove('open');
    }
  });

  // Close when clicking anywhere else on the document (outside both the button and the content sheet)
  document.addEventListener('click', (e) => {
    if (!settingsPanel.classList.contains('open')) return;
    const clickedButton  = settingsButton.contains(e.target);
    const clickedContent = panelContent.contains(e.target);
    if (!clickedButton && !clickedContent) {
      settingsPanel.classList.remove('open');
    }
  });

  // Optional: Esc key closes the panel
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && settingsPanel.classList.contains('open')) {
      settingsPanel.classList.remove('open');
      settingsButton.focus();
    }
  });
});