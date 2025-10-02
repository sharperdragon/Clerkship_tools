

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