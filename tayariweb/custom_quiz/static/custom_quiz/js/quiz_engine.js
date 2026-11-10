/**
 * TAYARIWEB CUSTOM QUIZ ENGINE v4.2
 * Compatible with existing models - no model changes required
 * Production-Grade | ES6+ Modular | Performance Optimized
 */

'use strict';

/**
 * Core Configuration & Constants
 */
const CONFIG = Object.freeze({
  API_TIMEOUT: 10000,
  DEBOUNCE_DELAY: 300,
  THROTTLE_DELAY: 150,
  ANIMATION_DURATION: 300,
  SCORE_ANIMATION_DURATION: 1500,
  AUTO_SUBMIT_WARNING_THRESHOLD: 60,
  TIMER_WARNING_THRESHOLD: 180,
  AD_DISPLAY_INTERVALS: [10, 20, 30],
  MINIMUM_SEARCH_LENGTH: 2,
  MAX_TOPICS: 10,
  PASSING_PERCENTAGE: 60,
  NEGATIVE_MARKING_PENALTY: 0.25,
  CIRCUMFERENCE: 2 * Math.PI * 45,
  STORAGE_KEY: 'tayari_quiz_state',
  MAX_STORAGE_AGE: 30 * 60 * 1000,
  CLS_RESERVE_HEIGHTS: {
    top: 90,
    sidebar: 250,
    sidebarWide: 600,
    inline: 250,
    mobileSticky: 100
  }
});

/**
 * Color System (Design Tokens)
 */
const THEME = Object.freeze({
  primary: '#563d7c',
  primaryDark: '#322348',
  primaryLight: '#7a5fb0',
  primaryLighter: '#9b82c8',
  accentGold: '#fbbf24',
  accentGoldDark: '#f59e0b',
  accentGreen: '#34d399',
  accentGreenDark: '#10b981',
  accentCoral: '#f87171',
  accentCoralDark: '#ef4444',
  textDark: '#1f1f1f',
  textMedium: '#4b5563',
  textLight: '#6b7280',
  textMuted: '#9ca3af',
  bgWhite: '#ffffff',
  bgLight: '#f8f7fa',
  bgLighter: '#f3f4f6',
  border: '#e5e7eb',
  borderLight: '#f3f4f6'
});

/**
 * State Management
 */
const createState = () => ({
  config: {
    mainCategory: '',
    subCategories: [],
    topics: [],
    questionCount: 50,
    timeLimit: 45,
    difficulty: { easy: 33, medium: 33, hard: 34 },
    quizType: 'exam',
    negativeMarking: false,
    randomOrder: true
  },
  quiz: {
    questions: [],
    currentIndex: 0,
    answers: new Map(),
    timeRemaining: 0,
    timerInterval: null,
    warningShown: false,
    availableCount: 0,
    isSubmitting: false,
    isLoading: false,
    startTime: null,
    endTime: null
  },
  ui: {
    abortControllers: new Map(),
    observers: new Map(),
    intersectionObserver: null,
    resizeObserver: null,
    cachedElements: new Map(),
    debounceTimers: new Map()
  }
});

let State = createState();

/**
 * Utility Functions
 */
const Utils = {
  debounce: (fn, delay = CONFIG.DEBOUNCE_DELAY) => {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(null, args), delay);
    };
  },

  throttle: (fn, delay = CONFIG.THROTTLE_DELAY) => {
    let lastCall = 0;
    return (...args) => {
      const now = performance.now();
      if (now - lastCall >= delay) {
        lastCall = now;
        fn.apply(null, args);
      }
    };
  },

  escapeHtml: (() => {
    const div = document.createElement('div');
    return (text) => {
      if (!text || typeof text !== 'string') return '';
      div.textContent = text;
      return div.innerHTML;
    };
  })(),

  formatTime: (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  },

  getTimePerQuestion: (totalMinutes, questionCount) => {
    if (!totalMinutes || !questionCount) return 0;
    return Math.round((totalMinutes * 60) / questionCount);
  },

  getCsrfToken: () => {
    const match = document.cookie.match(/csrftoken=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : '';
  },

  deepClone: (obj) => JSON.parse(JSON.stringify(obj)),

  clamp: (val, min, max) => Math.min(Math.max(val, min), max),

  animateNumber: (element, start, end, duration, suffix = '') => {
    const range = end - start;
    const startTime = performance.now();
    
    const update = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easeProgress = 1 - Math.pow(1 - progress, 4);
      element.textContent = Math.round(start + (range * easeProgress)) + suffix;
      
      if (progress < 1) requestAnimationFrame(update);
    };
    
    requestAnimationFrame(update);
  },

  saveState: () => {
    try {
      const stateToSave = {
        config: State.config,
        quiz: {
          questions: State.quiz.questions,
          answers: Array.from(State.quiz.answers.entries()),
          currentIndex: State.quiz.currentIndex,
          timeRemaining: State.quiz.timeRemaining,
          timestamp: Date.now()
        }
      };
      sessionStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(stateToSave));
    } catch (e) {
      console.warn('State save failed:', e);
    }
  },

  restoreState: () => {
    try {
      const saved = sessionStorage.getItem(CONFIG.STORAGE_KEY);
      if (!saved) return null;
      
      const parsed = JSON.parse(saved);
      if (Date.now() - parsed.quiz.timestamp > CONFIG.MAX_STORAGE_AGE) {
        sessionStorage.removeItem(CONFIG.STORAGE_KEY);
        return null;
      }
      
      return parsed;
    } catch (e) {
      return null;
    }
  },

  clearState: () => {
    try {
      sessionStorage.removeItem(CONFIG.STORAGE_KEY);
    } catch (e) {
      console.warn('State clear failed:', e);
    }
  }
};

/**
 * DOM Manager - Fixed caching issues
 */
const DOM = {
  cache: new Map(),

  get: (id) => {
    if (!id || typeof id !== 'string') return null;
    
    // Always verify element exists in DOM
    if (DOM.cache.has(id)) {
      const cached = DOM.cache.get(id);
      if (cached && document.contains(cached)) {
        return cached;
      }
      DOM.cache.delete(id);
    }
    
    const el = document.getElementById(id);
    if (el) DOM.cache.set(id, el);
    return el;
  },

  query: (selector, context = document) => {
    if (!selector || typeof selector !== 'string') return null;
    
    const key = `${selector}|${context.id || 'root'}`;
    
    if (DOM.cache.has(key)) {
      const cached = DOM.cache.get(key);
      if (cached && document.contains(cached)) {
        return cached;
      }
      DOM.cache.delete(key);
    }
    
    const el = context.querySelector(selector);
    if (el) DOM.cache.set(key, el);
    return el;
  },

  queryAll: (selector, context = document) => 
    Array.from(context.querySelectorAll(selector)),

  toggle: (element, show) => {
    if (!element || !(element instanceof HTMLElement)) return;
    
    element.classList.toggle('hidden', !show);
    element.setAttribute('aria-hidden', (!show).toString());
    
    // Force display property
    if (!show) {
      element.style.display = 'none';
    } else {
      element.style.display = '';
    }
  },

  on: (element, event, handler, options = {}) => {
    if (!element || !(element instanceof HTMLElement)) return;
    element.addEventListener(event, handler, { passive: true, ...options });
    
    if (!element._listeners) element._listeners = [];
    element._listeners.push({ event, handler, options });
  },

  create: (tag, attrs = {}, children = []) => {
    const el = document.createElement(tag);
    Object.entries(attrs).forEach(([key, value]) => {
      if (key === 'text') el.textContent = value;
      else if (key === 'html') el.innerHTML = value;
      else if (key.startsWith('data-')) el.dataset[key.slice(5)] = value;
      else if (key.startsWith('aria-')) el.setAttribute(key, value);
      else el.setAttribute(key, value);
    });
    children.forEach(child => el.appendChild(child));
    return el;
  },

  focus: (element) => {
    if (element?.focus && element instanceof HTMLElement) {
      element.setAttribute('tabindex', '-1');
      element.focus({ preventScroll: true });
    }
  },

  announce: (() => {
    let announcer = null;
    return (message, priority = 'polite') => {
      if (!announcer) {
        announcer = DOM.create('div', {
          id: 'sr-announcer',
          class: 'sr-only',
          ariaLive: priority,
          ariaAtomic: 'true'
        });
        document.body.appendChild(announcer);
      }
      announcer.setAttribute('aria-live', priority);
      announcer.textContent = message;
      setTimeout(() => announcer.textContent = '', 1000);
    };
  })(),

  setButtonLoading: (button, loading = true) => {
    if (!button || !(button instanceof HTMLElement)) return;
    
    if (loading) {
      if (!button.dataset.originalHtml) {
        button.dataset.originalHtml = button.innerHTML;
      }
      button.innerHTML = `
        <span class="btn-loader" aria-hidden="true">
          <span class="loader-dot"></span>
          <span class="loader-dot"></span>
          <span class="loader-dot"></span>
        </span>
        <span class="sr-only">Loading...</span>
      `;
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
    } else {
      button.innerHTML = button.dataset.originalHtml || button.innerHTML;
      button.disabled = false;
      button.removeAttribute('aria-busy');
    }
  },

  showValidation: (message, type = 'error', duration = 5000) => {
    const icons = { error: '⚠️', success: '✓', warning: 'ℹ️', info: '💡' };
    const roles = { error: 'alert', success: 'status', warning: 'alert', info: 'status' };
    
    const existing = document.querySelector('.validation-message');
    if (existing) {
      existing.classList.add('validation-exit');
      setTimeout(() => existing.remove(), 300);
    }

    const div = DOM.create('div', {
      class: `validation-message validation-${type}`,
      role: roles[type],
      ariaLive: type === 'error' ? 'assertive' : 'polite'
    }, [
      DOM.create('span', { class: 'validation-icon', text: icons[type] }),
      DOM.create('span', { class: 'validation-text', text: message })
    ]);

    document.body.appendChild(div);
    requestAnimationFrame(() => div.classList.add('validation-enter'));

    if (duration > 0) {
      setTimeout(() => {
        div.classList.add('validation-exit');
        setTimeout(() => div.remove(), 300);
      }, duration);
    }

    DOM.announce(message, type === 'error' ? 'assertive' : 'polite');
    return div;
  },

  clearCache: () => DOM.cache.clear()
};

/**
 * API Manager
 */
const API = {
  request: async (url, options = {}) => {
    if (State.ui.abortControllers.has(url)) {
      State.ui.abortControllers.get(url).abort();
    }

    const controller = new AbortController();
    State.ui.abortControllers.set(url, controller);

    const defaultOptions = {
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': Utils.getCsrfToken(),
        'X-Requested-With': 'XMLHttpRequest'
      },
      signal: controller.signal,
      credentials: 'same-origin'
    };

    const timeoutId = setTimeout(() => controller.abort(), CONFIG.API_TIMEOUT);

    try {
      const response = await fetch(url, {
        ...defaultOptions,
        ...options,
        headers: { ...defaultOptions.headers, ...options.headers },
        body: options.body ? (
          typeof options.body === 'string' ? options.body : JSON.stringify(options.body)
        ) : undefined
      });

      clearTimeout(timeoutId);
      State.ui.abortControllers.delete(url);

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      
      return { success: true, data: await response.json() };
    } catch (error) {
      clearTimeout(timeoutId);
      State.ui.abortControllers.delete(url);
      
      if (error.name === 'AbortError') {
        return { success: false, error: 'Request cancelled', aborted: true };
      }
      return { success: false, error: error.message };
    }
  },

  checkAvailability: (mainCategory, subCategories) => 
    API.request(window.QUIZ_API_URLS?.checkAvailability || '', {
      method: 'POST',
      body: { mainCategory, subCategories }
    }),

  searchTopics: (query) => 
    API.request(`${window.QUIZ_API_URLS?.topics || ''}?q=${encodeURIComponent(query)}`, { method: 'GET' }),

  generateQuiz: (config) => 
    API.request(window.QUIZ_API_URLS?.generate || '', {
      method: 'POST',
      body: config
    })
};

/**
 * Ad Manager
 */
const AdManager = {
  init: () => {
    if (!window.IntersectionObserver) {
      AdManager.loadAll();
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting && entry.target.dataset.adStatus === 'loading') {
          AdManager.loadAd(entry.target);
          observer.unobserve(entry.target);
        }
      });
    }, { rootMargin: '100px', threshold: 0.1 });

    State.ui.intersectionObserver = observer;
    
    DOM.queryAll('[data-ad-status="loading"]').forEach(ad => observer.observe(ad));
  },

  loadAd: (container) => {
    if (!container || container.dataset.adStatus !== 'loading') return;
    
    container.dataset.adStatus = 'loaded';
    
    try {
      if (window.adsbygoogle?.push) {
        window.adsbygoogle.push({});
      }
    } catch (e) {
      container.dataset.adStatus = 'error';
    }
  },

  loadAll: () => {
    DOM.queryAll('[data-ad-status="loading"]').forEach(AdManager.loadAd);
  },

  refresh: (container) => {
    if (container) {
      container.dataset.adStatus = 'loading';
      AdManager.loadAd(container);
    }
  },

  destroy: () => {
    State.ui.intersectionObserver?.disconnect();
  }
};

/**
 * Quiz Logic Controller
 * FIXED: Properly handles CATEGORY_DATA from template
 */
const QuizLogic = {
  init: () => {
    QuizLogic.validateEnvironment();
    QuizLogic.restorePreviousState();
    QuizLogic.attachEventListeners();
    QuizLogic.initializeDefaults();
    QuizLogic.updateSummary();
    AdManager.init();

    window.addEventListener('beforeunload', QuizLogic.handleBeforeUnload, { passive: true });
    document.addEventListener('keydown', QuizLogic.handleKeyboard);
    document.addEventListener('visibilitychange', QuizLogic.handleVisibilityChange, { passive: true });

    setInterval(Utils.saveState, 5000);
    
    DOM.announce('Quiz generator ready. Select a category to begin.', 'polite');
  },

  validateEnvironment: () => {
    // Validate CATEGORY_DATA exists and is properly structured
    if (!window.CATEGORY_DATA || !Array.isArray(window.CATEGORY_DATA)) {
      console.error('CRITICAL: CATEGORY_DATA not found or invalid');
      DOM.showValidation('Error: Quiz configuration failed to load. Please refresh.', 'error', 0);
      return false;
    }

    console.log('CATEGORY_DATA loaded:', window.CATEGORY_DATA.length, 'categories');
    
    // Log each category for debugging
    window.CATEGORY_DATA.forEach((cat, idx) => {
      console.log(`Category ${idx + 1}:`, {
        name: cat.name,
        slug: cat.slug,
        total_questions: cat.total_questions,
        subcategories_count: Array.isArray(cat.subcategories) ? cat.subcategories.length : 'INVALID'
      });
    });

    const required = ['mainCategory', 'subCategoryGroup', 'subCategoryGrid', 'quizInterface', 'generatorSection', 'resultsSection', 'startQuizBtn'];
    const missing = required.filter(id => !DOM.get(id));
    if (missing.length) {
      console.warn('Missing DOM elements:', missing);
    }
    
    return true;
  },

  restorePreviousState: () => {
    const saved = Utils.restoreState();
    if (saved?.config && confirm('Resume previous quiz session?')) {
      State.config = saved.config;
      if (saved.quiz.questions?.length) {
        State.quiz.questions = saved.quiz.questions;
        State.quiz.answers = new Map(saved.quiz.answers);
        State.quiz.currentIndex = saved.quiz.currentIndex || 0;
      }
    }
  },

  initializeDefaults: () => {
    QuizLogic.selectQuizType('exam');
    
    const rangeInput = DOM.get('questionCount');
    const rangeDisplay = DOM.get('questionCountVal');
    if (rangeInput && rangeDisplay) {
      rangeDisplay.textContent = rangeInput.value;
    }
    
    QuizLogic.setPresetTime(45);
  },

  attachEventListeners: () => {
    const mainCat = DOM.get('mainCategory');
    if (mainCat) {
      // FIXED: Proper event listener with debug logging
      DOM.on(mainCat, 'change', (e) => {
        console.log('Main category changed to:', e.target.value);
        QuizLogic.loadSubCategories();
      });
    }

    const questionCount = DOM.get('questionCount');
    if (questionCount) {
      const debouncedUpdate = Utils.debounce(() => {
        QuizLogic.checkAvailability();
        QuizLogic.updateSummary();
      }, 500);

      DOM.on(questionCount, 'input', (e) => QuizLogic.updateRangeDisplay(e.target));
      DOM.on(questionCount, 'change', debouncedUpdate);
    }

    const topicInput = DOM.get('topicSearch');
    if (topicInput) {
      const debouncedSearch = Utils.debounce(
        (e) => QuizLogic.handleTopicSearch(e),
        CONFIG.DEBOUNCE_DELAY
      );

      DOM.on(topicInput, 'input', debouncedSearch);
      DOM.on(topicInput, 'keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const value = e.target.value.trim();
          if (value) QuizLogic.addTopic(value);
        }
      });
    }

    // Event delegation for quiz type cards
    const quizTypeGrid = DOM.get('quizTypeGrid');
    if (quizTypeGrid) {
      DOM.on(quizTypeGrid, 'click', (e) => {
        const card = e.target.closest('.type-card');
        if (card) {
          QuizLogic.selectQuizType(card.dataset.type);
        }
      });
    }

    DOM.queryAll('form').forEach(form => {
      DOM.on(form, 'submit', (e) => e.preventDefault());
    });

    // Review filters
    const reviewFilters = DOM.query('.review-filters');
    if (reviewFilters) {
      DOM.on(reviewFilters, 'click', (e) => {
        const btn = e.target.closest('.filter-btn');
        if (btn) {
          QuizLogic.filterReview(btn.dataset.filter);
        }
      });
    }
  },

  /**
   * FIXED: loadSubCategories - Properly handles CATEGORY_DATA from template
   */
  /**
 * FIXED: loadSubCategories - Properly handles CATEGORY_DATA from template
 */
loadSubCategories: () => {
  const mainCatSelect = DOM.get('mainCategory');
  if (!mainCatSelect) {
    console.error('Main category select not found');
    return;
  }

  const mainCatSlug = mainCatSelect.value || '';
  console.log('Loading subcategories for slug:', mainCatSlug);

  // Reset state
  State.config.mainCategory = mainCatSlug;
  State.config.subCategories = [];

  // Get DOM elements
  const subGroup = DOM.get('subCategoryGroup');
  const subGrid = DOM.get('subCategoryGrid');
  const topicGroup = DOM.get('topicGroup');
  const subCategoryEmpty = DOM.get('subCategoryEmpty');
  const subCategoryLoading = DOM.get('subCategoryLoading');

  // Clear previous content
  if (subGrid) subGrid.innerHTML = '';
  
  // Hide sections initially
  DOM.toggle(subGroup, false);
  DOM.toggle(topicGroup, false);
  if (subCategoryEmpty) DOM.toggle(subCategoryEmpty, false);

  // Validate category selection
  if (!mainCatSlug) {
    console.log('No category selected');
    QuizLogic.updateSummary();
    QuizLogic.setStartButtonState(false, 'default');
    return;
  }

  // Show loading state
  if (subCategoryLoading) DOM.toggle(subCategoryLoading, true);

  // Validate CATEGORY_DATA
  if (!window.CATEGORY_DATA || !Array.isArray(window.CATEGORY_DATA)) {
    console.error('CATEGORY_DATA is not available');
    DOM.showValidation('Error: Category data not loaded', 'error');
    if (subCategoryLoading) DOM.toggle(subCategoryLoading, false);
    return;
  }

  // Find category data by slug
  const categoryData = window.CATEGORY_DATA.find(c => c && c.slug === mainCatSlug);
  
  if (!categoryData) {
    console.error('Category not found in CATEGORY_DATA:', mainCatSlug);
    console.log('Available slugs:', window.CATEGORY_DATA.map(c => c?.slug));
    DOM.showValidation('Error: Category not found', 'error');
    if (subCategoryLoading) DOM.toggle(subCategoryLoading, false);
    return;
  }

  console.log('Found category:', categoryData.name, 'with', categoryData.total_questions, 'questions');

  // Hide loading
  if (subCategoryLoading) DOM.toggle(subCategoryLoading, false);

  // Get subcategories array
  const subcategories = categoryData.subcategories || [];

  console.log('Subcategories count:', subcategories.length);

  // Handle empty subcategories
  if (subcategories.length === 0) {
    console.log('No subcategories available for:', mainCatSlug);
    
    // Show empty state
    if (subCategoryEmpty) {
      DOM.toggle(subCategoryEmpty, true);
      const emptyText = subCategoryEmpty.querySelector('p');
      if (emptyText) {
        emptyText.innerHTML = `<strong>No subcategories available for ${Utils.escapeHtml(categoryData.name)}</strong>`;
      }
    }
    
    // Still show the group so user knows they can proceed with main category
    DOM.toggle(subGroup, true);
    DOM.toggle(topicGroup, true);
    
    QuizLogic.checkAvailability();
    QuizLogic.updateSummary();
    return;
  }

  // Render subcategories
  if (subGrid) {
    const html = subcategories.map((sub, index) => {
      // Validate subcategory data
      if (!sub || typeof sub !== 'object') {
        console.warn('Invalid subcategory at index', index, sub);
        return '';
      }
      
      const name = sub.name || 'Unknown';
      const count = sub.question_count || 0;
      
      return `
        <label class="checkbox-item" 
               data-value="${Utils.escapeHtml(name)}" 
               data-count="${count}"
               id="subcat-${index}"
               tabindex="0" 
               role="checkbox" 
               aria-checked="false">
          <input type="checkbox" 
                 value="${Utils.escapeHtml(name)}" 
                 tabindex="-1"
                 aria-labelledby="subcat-label-${index}">
          <span class="checkbox-text" id="subcat-label-${index}">
            ${Utils.escapeHtml(name)} 
            <small class="question-count">(${count} questions)</small>
          </span>
        </label>
      `;
    }).join('');

    subGrid.innerHTML = html || '<p style="grid-column: 1 / -1; text-align: center; color: var(--text-light);">No subcategories available</p>';

    // Event delegation for subcategory selection
    DOM.on(subGrid, 'click', (e) => {
      const item = e.target.closest('.checkbox-item');
      if (item && !e.target.matches('input[type="checkbox"]')) {
        QuizLogic.toggleSubCategory(item);
      }
    });

    DOM.on(subGrid, 'keydown', (e) => {
      if (e.key === ' ' || e.key === 'Enter') {
        const item = e.target.closest('.checkbox-item');
        if (item) {
          e.preventDefault();
          QuizLogic.toggleSubCategory(item);
        }
      }
    });
  }

  // Show sections
  DOM.toggle(subGroup, true);
  DOM.toggle(topicGroup, true);
  
  // Hide empty state since we have subcategories
  if (subCategoryEmpty) DOM.toggle(subCategoryEmpty, false);

  // Scroll into view
  if (subGroup) {
    subGroup.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  QuizLogic.checkAvailability();
  QuizLogic.updateSummary();
},
  /**
   * FIXED: toggleSubCategory - Proper state management
   */
  /**
 * FIXED: toggleSubCategory - Proper state management
 */
toggleSubCategory: (element) => {
  if (!element || !(element instanceof HTMLElement)) {
    console.error('Invalid element passed to toggleSubCategory');
    return;
  }

  const checkbox = element.querySelector('input[type="checkbox"]');
  const value = element.dataset.value;
  
  if (!checkbox || !value) {
    console.error('Checkbox or value not found in element');
    return;
  }

  // Toggle visual state
  const isSelected = !element.classList.contains('selected');
  element.classList.toggle('selected', isSelected);
  checkbox.checked = isSelected;
  element.setAttribute('aria-checked', isSelected.toString());

  // Update state array
  if (isSelected) {
    if (!State.config.subCategories.includes(value)) {
      State.config.subCategories.push(value);
    }
  } else {
    State.config.subCategories = State.config.subCategories.filter(s => s !== value);
  }

  // Update count display
  const countEl = DOM.get('subCategoryCount');
  if (countEl) {
    const count = State.config.subCategories.length;
    countEl.textContent = `${count} selected`;
    countEl.classList.toggle('has-selection', count > 0);
  }

  console.log('Selected subcategories:', State.config.subCategories);

  QuizLogic.checkAvailability();
  QuizLogic.updateSummary();
},

checkAvailability: async () => {
  if (!State.config.mainCategory) return;

  const result = await API.checkAvailability(
    State.config.mainCategory,
    State.config.subCategories
  );

  if (result.aborted) return;

  if (result.success) {
    State.quiz.availableCount = result.data.available_count || 0;
    QuizLogic.updateAvailabilityUI();
  } else {
    State.quiz.availableCount = 0;
    QuizLogic.updateAvailabilityUI(true);
  }
},
updateAvailabilityUI: (isError = false) => {
  const countEl = DOM.get('availableCount');
  const container = DOM.get('availableQuestions');
  const warningEl = DOM.get('availabilityWarning');
  const messageEl = DOM.get('availabilityMessage');

  const available = State.quiz.availableCount;
  const requested = State.config.questionCount;
  const isSufficient = available >= requested && available > 0;

  if (countEl) countEl.textContent = isError ? '?' : available;
  DOM.toggle(container, true);

  if (isError) {
    DOM.toggle(warningEl, true);
    if (messageEl) messageEl.textContent = 'Unable to check availability. Please try again.';
    QuizLogic.setStartButtonState(false, 'error');
  } else if (!isSufficient) {
    // MODIFIED: Show warning but enable start button with limited count
    DOM.toggle(warningEl, true);
    if (messageEl) {
      messageEl.innerHTML = `
        Only <strong>${available}</strong> questions available for your selection, 
        but you requested <strong>${requested}</strong>.<br>
        <strong>Quiz will start with ${Math.min(available, requested)} questions.</strong>
      `;
    }
    // Enable button with limited count
    QuizLogic.setStartButtonState(true, 'limited', available);
  } else {
    DOM.toggle(warningEl, false);
    QuizLogic.setStartButtonState(true);
  }
},

setStartButtonState: (enabled, reason = '', availableCount = null) => {
  const startBtn = DOM.get('startQuizBtn');
  const startHint = DOM.get('startHint');

  if (!startBtn) return;

  startBtn.disabled = !enabled;

  const messages = {
    insufficient: '⚠ Not enough questions available for selected categories',
    error: '⚠ Unable to verify question availability',
    default: 'Select a category to enable quiz generation'
  };

  if (startHint) {
    if (enabled && reason === 'limited' && availableCount > 0) {
      startHint.innerHTML = `⚠ Only ${availableCount} questions available. Click to start with ${Math.min(availableCount, State.config.questionCount)} questions.`;
      startHint.style.color = THEME.accentGoldDark;
    } else if (enabled) {
      startHint.textContent = '✓ Ready to generate your quiz!';
      startHint.style.color = THEME.accentGreenDark;
    } else {
      startHint.textContent = messages[reason] || messages.default;
      startHint.style.color = THEME.textLight;
    }
  }
  
  // Store available count for startQuiz to use
  if (availableCount !== null) {
    startBtn.dataset.availableCount = availableCount;
  } else {
    delete startBtn.dataset.availableCount;
  }
},
  handleTopicSearch: async (e) => {
    const value = e.target.value.toLowerCase().trim();
    const suggestions = DOM.get('topicSuggestions');

    if (value.length < CONFIG.MINIMUM_SEARCH_LENGTH) {
      DOM.toggle(suggestions, false);
      return;
    }

    const result = await API.searchTopics(value);
    if (!result.success || !result.data?.topics?.length) {
      DOM.toggle(suggestions, false);
      return;
    }

    if (suggestions) {
      suggestions.innerHTML = result.data.topics.map(t => `
        <div class="suggestion-item" 
             data-topic="${Utils.escapeHtml(t)}" 
             tabindex="0"
             role="option">${Utils.escapeHtml(t)}</div>
      `).join('');

      DOM.toggle(suggestions, true);

      suggestions.querySelectorAll('.suggestion-item').forEach(item => {
        DOM.on(item, 'click', () => QuizLogic.addTopic(item.dataset.topic));
        DOM.on(item, 'keydown', (e) => {
          if (e.key === 'Enter') QuizLogic.addTopic(item.dataset.topic);
        });
      });
    }
  },

  addTopic: (topic) => {
    if (!topic || State.config.topics.includes(topic)) return;
    
    if (State.config.topics.length >= CONFIG.MAX_TOPICS) {
      DOM.showValidation(`Maximum ${CONFIG.MAX_TOPICS} topics allowed`, 'warning');
      return;
    }

    State.config.topics.push(topic);
    QuizLogic.renderTopics();

    const input = DOM.get('topicSearch');
    if (input) {
      input.value = '';
      input.focus();
    }

    const suggestions = DOM.get('topicSuggestions');
    DOM.toggle(suggestions, false);
    
    QuizLogic.updateSummary();
  },

  removeTopic: (topic) => {
    State.config.topics = State.config.topics.filter(t => t !== topic);
    QuizLogic.renderTopics();
    QuizLogic.updateSummary();
  },

  renderTopics: () => {
    const container = DOM.get('topicTags');
    if (!container) return;

    container.innerHTML = State.config.topics.map(t => `
      <span class="tag" data-topic="${Utils.escapeHtml(t)}">
        ${Utils.escapeHtml(t)}
        <button type="button" 
                class="tag-remove" 
                aria-label="Remove ${Utils.escapeHtml(t)}"
                data-topic="${Utils.escapeHtml(t)}">×</button>
      </span>
    `).join('');

    container.querySelectorAll('.tag-remove').forEach(btn => {
      DOM.on(btn, 'click', () => QuizLogic.removeTopic(btn.dataset.topic));
    });
  },

  updateRangeDisplay: (input) => {
    const value = parseInt(input.value) || 50;
    const display = DOM.get('questionCountVal');
    if (display) display.textContent = value;
    State.config.questionCount = value;

    DOM.queryAll('.range-presets button').forEach(btn => {
      const btnValue = parseInt(btn.textContent);
      btn.classList.toggle('active', btnValue === value);
    });
  },

  setRange: (value) => {
    const input = DOM.get('questionCount');
    if (input) {
      input.value = value;
      QuizLogic.updateRangeDisplay(input);
      QuizLogic.checkAvailability();
      QuizLogic.updateSummary();
    }
  },

  balanceDifficulty: (changed) => {
    const easyInput = DOM.get('diffEasy');
    const mediumInput = DOM.get('diffMedium');
    const hardInput = DOM.get('diffHard');
    if (!easyInput || !mediumInput || !hardInput) return;

    let easy = parseInt(easyInput.value) || 0;
    let medium = parseInt(mediumInput.value) || 0;
    let hard = parseInt(hardInput.value) || 0;

    const total = easy + medium + hard;
    if (total !== 100) {
      const diff = 100 - total;
      if (changed === 'easy') {
        medium = Utils.clamp(medium + Math.floor(diff / 2), 0, 100);
        hard = Utils.clamp(100 - easy - medium, 0, 100);
      } else if (changed === 'medium') {
        hard = Utils.clamp(hard + diff, 0, 100);
        easy = Utils.clamp(100 - medium - hard, 0, 100);
      } else if (changed === 'hard') {
        medium = Utils.clamp(medium + diff, 0, 100);
        easy = Utils.clamp(100 - medium - hard, 0, 100);
      }
      easyInput.value = easy;
      mediumInput.value = medium;
      hardInput.value = hard;
    }

    QuizLogic.updateDifficultyDisplay();
    QuizLogic.updateSummary();
  },

  updateDifficultyDisplay: () => {
    const easy = DOM.get('diffEasy')?.value || 33;
    const medium = DOM.get('diffMedium')?.value || 33;
    const hard = DOM.get('diffHard')?.value || 34;

    ['easy', 'medium', 'hard'].forEach(key => {
      const valEl = DOM.get(`diff${key.charAt(0).toUpperCase() + key.slice(1)}Val`);
      const fillEl = DOM.get(`fill${key.charAt(0).toUpperCase() + key.slice(1)}`);
      const barEl = DOM.get(`diffBar${key.charAt(0).toUpperCase() + key.slice(1)}`);
      const value = { easy, medium, hard }[key];
      
      if (valEl) valEl.textContent = value + '%';
      if (fillEl) fillEl.style.width = value + '%';
      if (barEl) barEl.style.width = value + '%';
    });

    State.config.difficulty = { easy: parseInt(easy), medium: parseInt(medium), hard: parseInt(hard) };
  },

  setTimeMode: (mode) => {
    const presetPanel = DOM.get('timePresetPanel');
    const customPanel = DOM.get('timeCustomPanel');

    DOM.queryAll('.time-mode-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });

    if (presetPanel) {
      presetPanel.classList.toggle('hidden', mode !== 'preset');
      presetPanel.style.display = mode === 'preset' ? 'block' : 'none';
    }
    if (customPanel) {
      customPanel.classList.toggle('hidden', mode !== 'custom');
      customPanel.style.display = mode === 'custom' ? 'block' : 'none';
    }
  },

  setPresetTime: (minutes) => {
    const timeLimit = DOM.get('timeLimit');
    if (timeLimit) timeLimit.value = minutes;
    State.config.timeLimit = minutes;

    DOM.queryAll('.preset-btn').forEach(btn => {
      btn.classList.toggle('active', parseInt(btn.dataset.minutes) === minutes);
    });

    QuizLogic.updateTimeEstimate();
    QuizLogic.updateSummary();
  },

  setCustomTime: (value) => {
    const minutes = parseInt(value) || 45;
    const timeLimit = DOM.get('timeLimit');
    if (timeLimit) timeLimit.value = minutes;
    State.config.timeLimit = minutes;
    QuizLogic.updateTimeEstimate();
    QuizLogic.updateSummary();
  },

  syncCustomTime: (value) => {
    const input = DOM.get('customTimeInput');
    if (input) input.value = value;
    QuizLogic.setCustomTime(value);
  },

  updateTimeUnit: () => {
    const unit = DOM.get('timeUnit')?.value || 'minutes';
    const slider = DOM.get('customTimeSlider');
    
    if (slider) {
      if (unit === 'hours') {
        slider.max = 3;
        slider.value = 1;
      } else {
        slider.max = 180;
        slider.value = 45;
      }
    }
    QuizLogic.syncCustomTime(slider?.value || 45);
  },

  updateTimeEstimate: () => {
    const estimate = DOM.get('timeEstimate');
    if (!estimate) return;

    const minutes = State.config.timeLimit;
    const questions = State.config.questionCount;

    if (minutes === 0) {
      estimate.innerHTML = '<span class="estimate-icon">⏱️</span><span class="estimate-text">No time limit</span>';
      estimate.className = 'time-estimate';
      return;
    }

    const secondsPerQ = Utils.getTimePerQuestion(minutes, questions);
    let urgencyClass = '';
    if (secondsPerQ < 30) urgencyClass = 'urgent';
    else if (secondsPerQ < 45) urgencyClass = 'warning';

    estimate.className = `time-estimate ${urgencyClass}`;
    estimate.innerHTML = `
      <span class="estimate-icon">⏱️</span>
      <span class="estimate-text">≈ ${secondsPerQ} seconds per question</span>
    `;
  },

  selectQuizType: (type) => {
    State.config.quizType = type;

    DOM.queryAll('.type-card').forEach(card => {
      const isActive = card.dataset.type === type;
      card.classList.toggle('active', isActive);
      card.setAttribute('aria-checked', isActive.toString());
      card.setAttribute('tabindex', isActive ? '0' : '-1');
    });

    const radio = document.querySelector(`input[name="quizType"][value="${type}"]`);
    if (radio) radio.checked = true;

    const negRow = DOM.get('negativeMarkingRow');
    const isExamMode = type === 'exam' || type === 'exam_review';

    if (negRow) {
      negRow.classList.toggle('hidden', !isExamMode);
      negRow.style.display = isExamMode ? 'block' : 'none';
    }

    if (!isExamMode) {
      State.config.negativeMarking = false;
      const negCheckbox = DOM.get('negativeMarking');
      if (negCheckbox) negCheckbox.checked = false;
    }

    QuizLogic.updateSummary();
  },

  toggleNegative: () => {
    const checkbox = DOM.get('negativeMarking');
    State.config.negativeMarking = checkbox?.checked || false;
    QuizLogic.updateSummary();
  },

  toggleRandomOrder: () => {
    const checkbox = DOM.get('randomOrder');
    State.config.randomOrder = checkbox?.checked ?? true;
  },

  updateSummary: () => {
    const catSelect = DOM.get('mainCategory');
    const catName = catSelect?.options[catSelect.selectedIndex]?.text?.split('(')[0].trim() || 'Not selected';
    const subCount = State.config.subCategories.length;

    const summaryCat = DOM.get('summaryCategories');
    if (summaryCat) {
      summaryCat.textContent = catName !== 'Not selected' && catName !== 'Choose a category...' ?
        catName + (subCount ? ` (${subCount} sub)` : '') : 'Not selected';
    }

    const summaryQuestions = DOM.get('summaryQuestions');
    if (summaryQuestions) summaryQuestions.textContent = State.config.questionCount;

    const timeLimit = State.config.timeLimit;
    const summaryTime = DOM.get('summaryTime');
    if (summaryTime) {
      summaryTime.textContent = timeLimit === 0 ? 'No limit' : `${timeLimit} minutes`;
    }

    QuizLogic.updateDifficultyDisplay();
    const summaryDiff = DOM.get('summaryDifficulty');
    if (summaryDiff) {
      summaryDiff.innerHTML = `
        <span class="diff-pill easy">Easy ${State.config.difficulty.easy}%</span>
        <span class="diff-pill medium">Med ${State.config.difficulty.medium}%</span>
        <span class="diff-pill hard">Hard ${State.config.difficulty.hard}%</span>
      `;
    }

    const typeNames = { practice: 'Practice Mode', exam: 'Exam Mode', exam_review: 'Exam + Review' };
    const summaryType = DOM.get('summaryType');
    if (summaryType) {
      summaryType.textContent = typeNames[State.config.quizType] || State.config.quizType;
      summaryType.className = `summary-value mode-${State.config.quizType}`;
    }

    const negRow = DOM.get('summaryNegativeRow');
    if (negRow) {
      negRow.classList.toggle('hidden', !State.config.negativeMarking);
      negRow.style.display = State.config.negativeMarking ? 'flex' : 'none';
    }

    const timePerQ = DOM.get('summaryTimePerQ');
    if (timePerQ) {
      if (State.config.timeLimit === 0) {
        timePerQ.textContent = 'Unlimited';
      } else {
        const seconds = Utils.getTimePerQuestion(State.config.timeLimit, State.config.questionCount);
        timePerQ.textContent = `${seconds} seconds`;
      }
    }

    QuizLogic.updateTimeEstimate();
  },

 startQuiz: async () => {
  if (State.quiz.isSubmitting) return;

  if (!State.config.mainCategory) {
    DOM.showValidation('Please select a main category', 'error');
    DOM.focus(DOM.get('mainCategory'));
    return;
  }

  // Get available count from button dataset or state
  const startBtn = DOM.get('startQuizBtn');
  const available = parseInt(startBtn?.dataset?.availableCount) || State.quiz.availableCount;
  const requested = State.config.questionCount;
  
  if (available === 0) {
    DOM.showValidation('No questions available for your selection. Please try different categories.', 'error');
    return;
  }

  // If limited questions, show confirmation and adjust
  if (available < requested) {
    const proceed = confirm(
      `Only ${available} questions available (you requested ${requested}).\n\n` +
      `Quiz will start with ${available} questions instead.\n\n` +
      `Do you want to continue?`
    );
    
    if (!proceed) return;
    
    // Adjust question count to available
    State.config.questionCount = available;
    
    // Show notification toast
    DOM.showValidation(
      `Starting quiz with ${available} questions (adjusted from ${requested})`,
      'warning',
      5000
    );
  }

  State.quiz.isSubmitting = true;
  DOM.setButtonLoading(startBtn, true);

  try {
    const result = await API.generateQuiz({
      mainCategory: State.config.mainCategory,
      subCategories: State.config.subCategories,
      topics: State.config.topics,
      questionCount: State.config.questionCount,
      timeLimit: State.config.timeLimit,
      difficulty: State.config.difficulty,
      quizType: State.config.quizType,
      negativeMarking: State.config.negativeMarking,
      randomOrder: State.config.randomOrder
    });

    if (!result.success) throw new Error(result.error || 'Failed to generate quiz');
    
    const data = result.data;
    if (!data.questions?.length) throw new Error('Invalid quiz data received');

    State.quiz.questions = data.questions;
    State.quiz.currentIndex = 0;
    State.quiz.answers = new Map();
    State.quiz.timeRemaining = State.config.timeLimit * 60;
    State.quiz.warningShown = false;
    State.quiz.startTime = Date.now();

    const genSection = DOM.get('generatorSection');
    const contentArea = DOM.get('contentArea');
    const sidebar = DOM.query('.quiz-sidebar');
    const quizInterface = DOM.get('quizInterface');

    if (genSection) {
      genSection.classList.add('hidden');
      genSection.style.display = 'none';
    }
    if (contentArea) {
      contentArea.classList.add('hidden');
      contentArea.style.display = 'none';
    }
    if (sidebar) {
      sidebar.classList.add('hidden');
      sidebar.style.display = 'none';
    }

    if (quizInterface) {
      quizInterface.classList.remove('hidden');
      quizInterface.style.display = 'block';
      quizInterface.setAttribute('tabindex', '-1');
      DOM.focus(quizInterface);
    }

    QuizLogic.renderQuestion();

    if (State.config.timeLimit > 0) QuizLogic.startTimer();

    const modeBadge = DOM.get('quizModeBadge');
    if (modeBadge) {
      modeBadge.textContent = State.config.quizType === 'exam' ? 'Exam Mode' :
                              State.config.quizType === 'exam_review' ? 'Exam + Review' : 'Practice Mode';
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
    DOM.announce(`Quiz started. Question 1 of ${State.quiz.questions.length}`, 'assertive');

  } catch (error) {
    console.error('Quiz generation failed:', error);
    DOM.showValidation(error.message || 'Failed to start quiz. Please try again.', 'error');
    if (startBtn) DOM.setButtonLoading(startBtn, false);
  } finally {
    State.quiz.isSubmitting = false;
  }
},

  renderQuestion: () => {
    const q = State.quiz.questions[State.quiz.currentIndex];
    if (!q) return;

    const container = DOM.get('questionContainer');
    const isLast = State.quiz.currentIndex === State.quiz.questions.length - 1;

    const progressEl = DOM.get('quizProgress');
    if (progressEl) {
      progressEl.textContent = `Question ${State.quiz.currentIndex + 1} of ${State.quiz.questions.length}`;
    }

    const titleEl = DOM.get('activeQuizTitle');
    if (titleEl) titleEl.textContent = `${State.config.mainCategory.toUpperCase()} Quiz`;

    if (container) {
      const hasAnswer = State.quiz.answers.has(q.id);
      const selectedIndex = State.quiz.answers.get(q.id);

      container.innerHTML = `
        <div class="question-text" id="questionText">${Utils.escapeHtml(q.text)}</div>
        <div class="options-list" role="radiogroup" aria-label="Answer options for question ${State.quiz.currentIndex + 1}">
          ${q.options.map((opt, idx) => `
            <label class="option ${hasAnswer && selectedIndex === idx ? 'selected' : ''}" 
                   id="opt-${idx}" 
                   data-index="${idx}" 
                   tabindex="${hasAnswer ? '-1' : '0'}" 
                   role="radio" 
                   aria-checked="${selectedIndex === idx}">
              <input type="radio" 
                     name="answer" 
                     value="${idx}" 
                     ${selectedIndex === idx ? 'checked' : ''}
                     tabindex="-1">
              <span class="option-text">${Utils.escapeHtml(opt)}</span>
            </label>
          `).join('')}
        </div>
        <div id="explanationContainer" class="explanation-container"></div>
      `;

      container.querySelectorAll('.option').forEach(opt => {
        DOM.on(opt, 'click', () => QuizLogic.selectOption(parseInt(opt.dataset.index)));
        DOM.on(opt, 'keydown', (e) => {
          if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            QuizLogic.selectOption(parseInt(opt.dataset.index));
          }
        });
      });
    }

    QuizLogic.updateNavigationButtons(isLast);
    QuizLogic.updateProgressBar();

    const midQuizAd = DOM.get('midQuizAd');
    if (midQuizAd) {
      const showAd = CONFIG.AD_DISPLAY_INTERVALS.includes(State.quiz.currentIndex + 1);
      midQuizAd.classList.toggle('hidden', !showAd);
      midQuizAd.style.display = showAd ? 'block' : 'none';
      if (showAd) AdManager.refresh(midQuizAd);
    }

    DOM.announce(`Question ${State.quiz.currentIndex + 1}. ${q.text.substring(0, 100)}...`, 'polite');
  },

  updateNavigationButtons: (isLast) => {
    const prevBtn = DOM.get('prevBtn');
    const checkBtn = DOM.get('checkBtn');
    const nextBtn = DOM.get('nextBtn');
    const finishBtn = DOM.get('finishBtn');

    if (prevBtn) prevBtn.disabled = State.quiz.currentIndex === 0;

    [checkBtn, nextBtn, finishBtn].forEach(btn => {
      if (btn) {
        btn.classList.add('hidden');
        btn.style.display = 'none';
      }
    });

    const q = State.quiz.questions[State.quiz.currentIndex];
    const hasAnswer = State.quiz.answers.has(q.id);

    if (State.config.quizType === 'exam') {
      if (isLast) {
        if (finishBtn) {
          finishBtn.classList.remove('hidden');
          finishBtn.style.display = 'inline-flex';
          finishBtn.disabled = !hasAnswer;
        }
      } else {
        if (nextBtn) {
          nextBtn.classList.remove('hidden');
          nextBtn.style.display = 'inline-flex';
          nextBtn.disabled = !hasAnswer;
        }
      }
    } else if (State.config.quizType === 'exam_review') {
      if (checkBtn) {
        checkBtn.classList.remove('hidden');
        checkBtn.style.display = 'inline-flex';
        checkBtn.textContent = 'Check Answer (Optional)';
      }
      if (isLast) {
        if (finishBtn) {
          finishBtn.classList.remove('hidden');
          finishBtn.style.display = 'inline-flex';
        }
      } else {
        if (nextBtn) {
          nextBtn.classList.remove('hidden');
          nextBtn.style.display = 'inline-flex';
          nextBtn.disabled = !hasAnswer;
        }
      }
    } else {
      if (checkBtn) {
        checkBtn.classList.remove('hidden');
        checkBtn.style.display = 'inline-flex';
        checkBtn.textContent = 'Check Answer';
      }
      if (isLast) {
        if (finishBtn) {
          finishBtn.classList.remove('hidden');
          finishBtn.style.display = 'inline-flex';
        }
      } else {
        if (nextBtn) {
          nextBtn.classList.remove('hidden');
          nextBtn.style.display = 'inline-flex';
          nextBtn.disabled = !hasAnswer;
        }
      }
    }
  },

  updateProgressBar: () => {
    const fill = DOM.get('progressFill');
    const text = DOM.get('progressText');
    const percent = Math.round(((State.quiz.currentIndex + 1) / State.quiz.questions.length) * 100);

    if (fill) fill.style.width = `${percent}%`;
    if (text) text.textContent = `${percent}% Complete`;
  },

  selectOption: (index) => {
    const q = State.quiz.questions[State.quiz.currentIndex];
    if (!q) return;

    State.quiz.answers.set(q.id, index);

    document.querySelectorAll('.option').forEach((opt, idx) => {
      const isSelected = idx === index;
      opt.classList.toggle('selected', isSelected);
      opt.setAttribute('aria-checked', isSelected.toString());
      const radio = opt.querySelector('input[type="radio"]');
      if (radio) radio.checked = isSelected;
    });

    const isLast = State.quiz.currentIndex === State.quiz.questions.length - 1;

    if (State.config.quizType === 'exam') {
      const btn = isLast ? DOM.get('finishBtn') : DOM.get('nextBtn');
      if (btn) btn.disabled = false;
    } else if (State.config.quizType === 'exam_review') {
      if (!isLast) {
        const nextBtn = DOM.get('nextBtn');
        if (nextBtn) nextBtn.disabled = false;
      }
    }

    Utils.saveState();
  },

  checkAnswer: () => {
    const q = State.quiz.questions[State.quiz.currentIndex];
    if (!State.quiz.answers.has(q.id)) {
      DOM.showValidation('Please select an answer', 'warning');
      return;
    }

    const userAnswer = State.quiz.answers.get(q.id);
    const isCorrect = userAnswer === q.correct;

    document.querySelectorAll('.option').forEach((opt, idx) => {
      opt.classList.add('disabled');
      opt.removeAttribute('tabindex');
      if (idx === q.correct) opt.classList.add('correct');
      else if (idx === userAnswer && !isCorrect) opt.classList.add('wrong');
    });

    if (q.explanation && (State.config.quizType === 'practice' || State.config.quizType === 'exam_review')) {
      const container = DOM.get('explanationContainer');
      if (container) {
        container.innerHTML = `
          <div class="explanation-box ${isCorrect ? 'correct' : 'wrong'}">
            <div class="explanation-header">
              <span class="explanation-icon">${isCorrect ? '✓' : '✗'}</span>
              <span class="explanation-title">${isCorrect ? 'Correct!' : 'Incorrect'}</span>
            </div>
            <div class="explanation-content">
              <strong>Explanation:</strong> ${Utils.escapeHtml(q.explanation)}
            </div>
          </div>
        `;
      }
    }

    const checkBtn = DOM.get('checkBtn');
    if (checkBtn) {
      checkBtn.classList.add('hidden');
      checkBtn.style.display = 'none';
    }
    
    const isLast = State.quiz.currentIndex === State.quiz.questions.length - 1;

    if (isLast) {
      const finishBtn = DOM.get('finishBtn');
      if (finishBtn) {
        finishBtn.classList.remove('hidden');
        finishBtn.style.display = 'inline-flex';
      }
    } else {
      const nextBtn = DOM.get('nextBtn');
      if (nextBtn) {
        nextBtn.classList.remove('hidden');
        nextBtn.style.display = 'inline-flex';
        nextBtn.disabled = false;
        DOM.focus(nextBtn);
      }
    }

    DOM.announce(isCorrect ? 'Correct! ' + (q.explanation || '') : 'Incorrect. The correct answer is: ' + q.options[q.correct], 'polite');
  },

  prevQuestion: () => {
    if (State.quiz.currentIndex > 0) {
      State.quiz.currentIndex--;
      QuizLogic.renderQuestion();
    }
  },

  nextQuestion: () => {
    if (State.quiz.currentIndex < State.quiz.questions.length - 1) {
      State.quiz.currentIndex++;
      QuizLogic.renderQuestion();
    }
  },

  confirmFinish: () => {
    const unanswered = State.quiz.questions.length - State.quiz.answers.size;
    if (unanswered > 0) {
      const confirmed = confirm(`You have ${unanswered} unanswered question${unanswered > 1 ? 's' : ''}. Are you sure you want to finish?`);
      if (!confirmed) return;
    }
    QuizLogic.finishQuiz();
  },

  startTimer: () => {
    QuizLogic.updateTimerDisplay();

    State.quiz.timerInterval = setInterval(() => {
      State.quiz.timeRemaining--;
      QuizLogic.updateTimerDisplay();

      if (State.quiz.timeRemaining === CONFIG.AUTO_SUBMIT_WARNING_THRESHOLD && !State.quiz.warningShown) {
        State.quiz.warningShown = true;
        QuizLogic.showAutoSubmitWarning();
      }

      if (State.quiz.timeRemaining <= 0) QuizLogic.finishQuiz();
      if (State.quiz.timeRemaining % 10 === 0) Utils.saveState();
    }, 1000);
  },

  updateTimerDisplay: () => {
    const display = Utils.formatTime(State.quiz.timeRemaining);
    const timerEl = DOM.get('timerDisplay');
    const timerContainer = DOM.get('quizTimer');

    if (timerEl) timerEl.textContent = display;

    if (timerContainer) {
      timerContainer.classList.remove('warning', 'danger');
      if (State.quiz.timeRemaining <= CONFIG.AUTO_SUBMIT_WARNING_THRESHOLD) {
        timerContainer.classList.add('danger');
      } else if (State.quiz.timeRemaining <= CONFIG.TIMER_WARNING_THRESHOLD) {
        timerContainer.classList.add('warning');
      }
    }
  },

  showAutoSubmitWarning: () => {
    const warning = DOM.get('autoSubmitWarning');
    if (!warning) return;

    warning.classList.remove('hidden');
    warning.style.display = 'flex';
    
    let seconds = CONFIG.AUTO_SUBMIT_WARNING_THRESHOLD;

    const countdown = setInterval(() => {
      seconds--;
      const span = DOM.get('countdownWarning');
      if (span) span.textContent = seconds;
      if (seconds <= 0) {
        clearInterval(countdown);
        warning.classList.add('hidden');
        warning.style.display = 'none';
      }
    }, 1000);

    DOM.announce('Warning: 60 seconds remaining. Quiz will auto-submit.', 'assertive');
  },

  finishQuiz: () => {
    if (State.quiz.timerInterval) {
      clearInterval(State.quiz.timerInterval);
      State.quiz.timerInterval = null;
    }

    State.quiz.endTime = Date.now();

    const quizInterface = DOM.get('quizInterface');
    const resultsSection = DOM.get('resultsSection');

    if (quizInterface) {
      quizInterface.classList.add('hidden');
      quizInterface.style.display = 'none';
    }
    if (resultsSection) {
      resultsSection.classList.remove('hidden');
      resultsSection.style.display = 'block';
    }

    QuizLogic.calculateResults();
    Utils.clearState();

    window.scrollTo({ top: 0, behavior: 'smooth' });
    DOM.announce('Quiz completed. View your results below.', 'assertive');
  },

  calculateResults: () => {
    let correct = 0, wrong = 0, skipped = 0;

    State.quiz.questions.forEach(q => {
      const answer = State.quiz.answers.get(q.id);
      if (answer === undefined) skipped++;
      else if (answer === q.correct) correct++;
      else wrong++;
    });

    const total = State.quiz.questions.length;
    const percentage = Math.round((correct / total) * 100);

    let score = correct;
    if (State.config.negativeMarking) {
      score = Math.max(0, correct - (wrong * CONFIG.NEGATIVE_MARKING_PENALTY));
    }

    const finalPercentage = Math.round((score / total) * 100);
    const passed = finalPercentage >= CONFIG.PASSING_PERCENTAGE;

    setTimeout(() => {
      const percentEl = DOM.get('scorePercent');
      const ringProgress = DOM.get('scoreRingProgress');

      if (percentEl) Utils.animateNumber(percentEl, 0, finalPercentage, CONFIG.SCORE_ANIMATION_DURATION, '%');
      if (ringProgress) {
        const offset = CONFIG.CIRCUMFERENCE - (finalPercentage / 100) * CONFIG.CIRCUMFERENCE;
        ringProgress.style.strokeDashoffset = offset;
      }
    }, 100);

    const badge = DOM.get('resultBadge');
    if (badge) {
      badge.textContent = passed ? 'Pass' : 'Fail';
      badge.className = `result-badge ${passed ? 'pass' : 'fail'}`;
    }

    const messageEl = DOM.get('resultMessage');
    if (messageEl) {
      const messages = {
        excellent: 'Excellent work! Outstanding performance!',
        good: 'Great job! You performed well.',
        average: 'Good effort! Keep practicing to improve.',
        needsWork: 'Keep practicing! You\'ll do better next time.'
      };
      let msg = messages.needsWork;
      if (finalPercentage >= 80) msg = messages.excellent;
      else if (finalPercentage >= 70) msg = messages.good;
      else if (finalPercentage >= 60) msg = messages.average;
      messageEl.textContent = msg;
    }

    const statCorrect = DOM.get('statCorrect');
    const statWrong = DOM.get('statWrong');
    const statSkipped = DOM.get('statSkipped');
    const statTime = DOM.get('statTime');

    if (statCorrect) statCorrect.textContent = correct;
    if (statWrong) statWrong.textContent = wrong;
    if (statSkipped) statSkipped.textContent = skipped;

    if (statTime) {
      if (State.config.timeLimit > 0 && State.quiz.startTime) {
        const timeUsed = Math.floor((State.quiz.endTime - State.quiz.startTime) / 1000);
        statTime.textContent = Utils.formatTime(timeUsed);
      } else {
        statTime.textContent = 'N/A';
      }
    }

    const countAll = DOM.get('countAll');
    const countCorrect = DOM.get('countCorrect');
    const countWrong = DOM.get('countWrong');
    const countSkipped = DOM.get('countSkipped');

    if (countAll) countAll.textContent = total;
    if (countCorrect) countCorrect.textContent = correct;
    if (countWrong) countWrong.textContent = wrong;
    if (countSkipped) countSkipped.textContent = skipped;

    QuizLogic.renderPerformanceBreakdown(correct, wrong, skipped);
    QuizLogic.renderReviewList();
  },

  renderPerformanceBreakdown: (correct, wrong, skipped) => {
    const container = DOM.get('breakdownGrid');
    if (!container) return;

    const total = State.quiz.questions.length;
    const accuracy = Math.round((correct / total) * 100);
    const attempted = total - skipped;
    const completion = Math.round((attempted / total) * 100);

    container.innerHTML = `
      <div class="breakdown-item">
        <span class="breakdown-value">${accuracy}%</span>
        <span class="breakdown-label">Accuracy</span>
      </div>
      <div class="breakdown-item">
        <span class="breakdown-value">${completion}%</span>
        <span class="breakdown-label">Completion</span>
      </div>
      <div class="breakdown-item">
        <span class="breakdown-value">${attempted}</span>
        <span class="breakdown-label">Attempted</span>
      </div>
      <div class="breakdown-item">
        <span class="breakdown-value">${State.config.timeLimit > 0 ? Utils.formatTime(Math.floor((State.quiz.endTime - State.quiz.startTime) / 1000)) : 'N/A'}</span>
        <span class="breakdown-label">Time Taken</span>
      </div>
    `;
  },

  renderReviewList: () => {
    const container = DOM.get('reviewList');
    if (!container) return;

    container.innerHTML = State.quiz.questions.map((q, idx) => {
      const answer = State.quiz.answers.get(q.id);
      let status = 'skipped';
      if (answer !== undefined) status = answer === q.correct ? 'correct' : 'wrong';

      const statusLabels = { correct: 'Correct', wrong: 'Wrong', skipped: 'Skipped' };
      const yourAnswer = answer !== undefined ? q.options[answer] : 'Not answered';
      const correctAnswer = q.options[q.correct];

      return `
        <div class="review-item ${status}" data-status="${status}" data-index="${idx}">
          <div class="review-head">
            <span class="review-question-num">Q${idx + 1}</span>
            <span class="review-badge ${status}">${statusLabels[status]}</span>
          </div>
          <div class="review-body">
            <p class="review-question">${Utils.escapeHtml(q.text)}</p>
            <p class="review-answer your-answer"><strong>Your Answer:</strong> ${Utils.escapeHtml(yourAnswer)}</p>
            <p class="review-answer correct-answer"><strong>Correct Answer:</strong> ${Utils.escapeHtml(correctAnswer)}</p>
            ${q.explanation ? `<div class="review-explanation"><strong>Explanation:</strong> ${Utils.escapeHtml(q.explanation)}</div>` : ''}
          </div>
        </div>
      `;
    }).join('');

    QuizLogic.filterReview('all');
  },

  filterReview: (type) => {
    DOM.queryAll('.filter-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.filter === type);
      btn.setAttribute('aria-selected', (btn.dataset.filter === type).toString());
    });

    DOM.queryAll('.review-item').forEach((item, index) => {
      const show = type === 'all' || item.dataset.status === type;
      item.style.display = show ? 'block' : 'none';
      if (show) item.style.animation = `fadeInUp 0.3s ease ${index * 0.05}s both`;
    });

    const count = DOM.queryAll(`.review-item[data-status="${type}"]`).length;
    DOM.announce(`Showing ${type} questions. ${type === 'all' ? State.quiz.questions.length : count} items.`, 'polite');
  },

  restartQuiz: () => {
    State.quiz.currentIndex = 0;
    State.quiz.answers = new Map();
    State.quiz.timeRemaining = State.config.timeLimit * 60;
    State.quiz.warningShown = false;
    State.quiz.startTime = Date.now();
    State.quiz.endTime = null;

    const resultsSection = DOM.get('resultsSection');
    const quizInterface = DOM.get('quizInterface');
    const autoSubmitWarning = DOM.get('autoSubmitWarning');

    if (resultsSection) {
      resultsSection.classList.add('hidden');
      resultsSection.style.display = 'none';
    }
    if (quizInterface) {
      quizInterface.classList.remove('hidden');
      quizInterface.style.display = 'block';
    }
    if (autoSubmitWarning) {
      autoSubmitWarning.classList.add('hidden');
      autoSubmitWarning.style.display = 'none';
    }

    QuizLogic.renderQuestion();

    if (State.config.timeLimit > 0) QuizLogic.startTimer();

    DOM.announce('Quiz restarted. Question 1.', 'assertive');
  },

  newQuiz: () => {
    Utils.clearState();
    window.location.reload();
  },

  shareResults: async () => {
    const percent = DOM.get('scorePercent')?.textContent || '0%';
    const text = `I scored ${percent} on TayariWeb Custom Quiz! Test your knowledge at`;
    const url = window.location.href;

    try {
      if (navigator.share) {
        await navigator.share({ title: 'My Quiz Results - TayariWeb', text, url });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(`${text} ${url}`);
        DOM.showValidation('Results copied to clipboard!', 'success');
      } else {
        prompt('Copy this text:', `${text} ${url}`);
      }
    } catch (err) {
      console.error('Share failed:', err);
    }
  },

  quickSelect: (category) => {
    const select = DOM.get('mainCategory');
    if (select) {
      select.value = category;
      // Trigger change event and load subcategories
      select.dispatchEvent(new Event('change', { bubbles: true }));
      QuizLogic.loadSubCategories();
      
      const section1 = DOM.get('section1');
      if (section1) section1.scrollIntoView({ behavior: 'smooth' });
    }
  },

  handleKeyboard: (e) => {
    const quizInterface = DOM.get('quizInterface');
    if (!quizInterface || quizInterface.classList.contains('hidden') || quizInterface.style.display === 'none') {
      if (e.key === 'Enter' && e.ctrlKey) {
        e.preventDefault();
        QuizLogic.startQuiz();
      }
      return;
    }

    if (e.key >= '1' && e.key <= '4' && !e.ctrlKey) {
      const index = parseInt(e.key) - 1;
      const options = document.querySelectorAll('.option:not(.disabled)');
      if (options[index]) {
        e.preventDefault();
        QuizLogic.selectOption(index);
      }
    }

    if (e.key === 'ArrowLeft' && !e.ctrlKey) {
      e.preventDefault();
      const prevBtn = DOM.get('prevBtn');
      if (prevBtn && !prevBtn.disabled) QuizLogic.prevQuestion();
    }

    if (e.key === 'ArrowRight' && !e.ctrlKey) {
      e.preventDefault();
      const nextBtn = DOM.get('nextBtn');
      const finishBtn = DOM.get('finishBtn');
      if (nextBtn && !nextBtn.classList.contains('hidden') && nextBtn.style.display !== 'none' && !nextBtn.disabled) {
        QuizLogic.nextQuestion();
      } else if (finishBtn && !finishBtn.classList.contains('hidden') && finishBtn.style.display !== 'none') {
        QuizLogic.confirmFinish();
      }
    }

    if ((e.key === ' ' || e.key === 'Enter') && !e.ctrlKey) {
      const checkBtn = DOM.get('checkBtn');
      if (checkBtn && !checkBtn.classList.contains('hidden') && checkBtn.style.display !== 'none') {
        e.preventDefault();
        QuizLogic.checkAnswer();
      }
    }

    if (e.key === 'Escape') {
      const finishBtn = DOM.get('finishBtn');
      if (finishBtn && !finishBtn.classList.contains('hidden') && finishBtn.style.display !== 'none') QuizLogic.confirmFinish();
    }
  },

  handleBeforeUnload: (e) => {
    if (State.quiz.timerInterval && State.quiz.timeRemaining > 0) {
      e.preventDefault();
      e.returnValue = 'You have a quiz in progress. Are you sure you want to leave?';
      Utils.saveState();
      return e.returnValue;
    }
  },

  handleVisibilityChange: () => {
    // Optional: Pause/resume timer on tab switch
  },

  destroy: () => {
    if (State.quiz.timerInterval) clearInterval(State.quiz.timerInterval);
    AdManager.destroy();
    DOM.clearCache();
    State.ui.abortControllers.forEach(controller => controller.abort());
    State.ui.abortControllers.clear();
  }
};

// ==================== INITIALIZATION ====================

const TayariQuiz = Object.freeze({
  init: QuizLogic.init,
  loadSubCategories: QuizLogic.loadSubCategories,
  toggleSubCategory: QuizLogic.toggleSubCategory,
  addTopic: QuizLogic.addTopic,
  removeTopic: QuizLogic.removeTopic,
  updateRangeDisplay: QuizLogic.updateRangeDisplay,
  setRange: QuizLogic.setRange,
  balanceDifficulty: QuizLogic.balanceDifficulty,
  setTimeMode: QuizLogic.setTimeMode,
  setPresetTime: QuizLogic.setPresetTime,
  setCustomTime: QuizLogic.setCustomTime,
  updateTimeUnit: QuizLogic.updateTimeUnit,
  syncCustomTime: QuizLogic.syncCustomTime,
  selectQuizType: QuizLogic.selectQuizType,
  toggleNegative: QuizLogic.toggleNegative,
  toggleRandomOrder: QuizLogic.toggleRandomOrder,
  startQuiz: QuizLogic.startQuiz,
  prevQuestion: QuizLogic.prevQuestion,
  nextQuestion: QuizLogic.nextQuestion,
  checkAnswer: QuizLogic.checkAnswer,
  confirmFinish: QuizLogic.confirmFinish,
  selectOption: QuizLogic.selectOption,
  filterReview: QuizLogic.filterReview,
  restartQuiz: QuizLogic.restartQuiz,
  newQuiz: QuizLogic.newQuiz,
  shareResults: QuizLogic.shareResults,
  quickSelect: QuizLogic.quickSelect,
  getState: () => Utils.deepClone(State),
  clearState: Utils.clearState,
  showValidation: DOM.showValidation,
  destroy: QuizLogic.destroy
});

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => TayariQuiz.init());
} else {
  TayariQuiz.init();
}

// Global exposure for HTML onclick handlers
window.quizGen = TayariQuiz;

// Cleanup on page unload
window.addEventListener('beforeunload', () => TayariQuiz.destroy());