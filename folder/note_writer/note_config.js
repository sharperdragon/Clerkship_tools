// note_config.js

const CONTENT_SELECTOR = '#content';        // where the tab's <main id="grid"> goes
const HEADER_BAR_SELECTOR = '#headerItems'; // fixed header strip host (children only)

// ! Tier-1 buttons (e.g., <button data-tab="PE">)
const TAB_BUTTONS_SELECTOR = '[data-tab]';

// ? Optional slots (just for organizing injected assets in DevTools)
const TAB_CSS_SLOT_ID = 'tab-css-slot';
const TAB_JS_SLOT_ID  = 'tab-js-slot';

// ? Start tab + routing/cache knobs
const DEFAULT_TAB = 'subjective';
const ENABLE_HTML_CACHE = true;
const ENABLE_HASH_ROUTING = true;


const ALIASES = {
  subjective: ['SUBJECTIVE', 'Subjective'],
  ros:        ['ROS', 'Ros'],
  pe:         ['PE', 'Pe', 'Physical', 'Physical Exam', 'Physcial'],
  mse:        ['MSE', 'Mse']
};

const TAB_LABELS = {
  subjective: 'Subjective',
  ros: 'ROS',
  pe: 'Physical Exam',
  mse: 'MSE'
};

window.NOTE_CONFIG = {
  routes: {
    SUBJECTIVE: { file: './html/subjective.html', headerSel: '#headerItems', mainSel: '#grid' },
    ROS:        { file: './html/ROS.html',        headerSel: null,          mainSel: '#grid' },
    MSE:        { file: './html/MSE.html',        headerSel: null,          mainSel: '#grid' },
    PE: {
      header: { file: './html/PE_header.html',      sel: '#headerItems' },
      mains:  { General: { file: './html/PE_General.html', sel: '#grid' } },
      subtabs: ['General']
    }
  },

  subjective: {
    headerFields: [
      'subj_visit_note',
      'subj_chief_complaint',
    ],
    hpiFields: [
      'hpi_onset',
      'hpi_progression',
      'hpi_palliate',
      'hpi_provoke',
      'hpi_quality',
      'hpi_quantity',
      'hpi_region',
      'hpi_timing',
      'hpi_assoc_symptoms',
    ],
    historyFields: [
      'subj_pmh',
      'subj_surg_hx',
      'subj_meds',
      'subj_allergies',
      'subj_social',
      'subj_lmp',
      'subj_fhx',
    ],
    multilineFields: [
      'subj_pmh',
      'subj_surg_hx',
      'subj_meds',
      'subj_allergies',
      'subj_social',
      'subj_lmp',
      'subj_fhx',
    ],
  },
};