/**
 * TAYARIWEB — PRODUCTION GRADE NAVBAR CONTROLLER
 * File: static/js/navbar.js
 * Handles: Mega menu, desktop dropdowns, mobile drawer, mobile search, accordions
 * Dependencies: None | WCAG 2.1 AA | Core Web Vitals Optimized
 * Version: 2.0.0
 */

(function() {
  'use strict';

  /* ============================================================
     CONFIGURATION & STATE
     ============================================================ */
  
  const CONFIG = {
    breakpoints: {
      mobile: 768
    },
    selectors: {
      // Mobile elements
      mobHam: '#twMobHam',
      mobDrawer: '#twMobDrawer',
      mobBackdrop: '#twMobBackdrop',
      mobClose: '#twMobClose',
      mobSearchBtn: '#twMobSearchBtn',
      mobSearchBar: '#twMobSearchBar',
      
      // Desktop elements
      allBtn: '#twAllBtn',
      megaMenu: '#twMegaMenu',
      
      // Interactive elements
      accToggles: '.tw-mob-acc-toggle',
      dropTriggers: '.tw-dropdown-trigger',
      actionTriggers: '.tw-action-btn'
    },
    classes: {
      isOpen: 'is-open',
      bodyMenuOpen: 'tw-menu-open'
    },
    attributes: {
      hidden: 'hidden',
      ariaExpanded: 'aria-expanded',
      ariaHidden: 'aria-hidden'
    }
  };

  const state = {
    drawerOpen: false,
    searchOpen: false,
    megaOpen: false,
    activeDropdown: null,
    isAnimating: false
  };

  /* ============================================================
     UTILITY FUNCTIONS
     ============================================================ */

  /**
   * Safe DOM query with null check
   */
  function $(selector, context = document) {
    return context.querySelector(selector);
  }

  /**
   * Safe DOM queryAll with array return
   */
  function $$(selector, context = document) {
    return Array.from(context.querySelectorAll(selector));
  }

  /**
   * Debounce function for performance
   */
  function debounce(fn, wait = 100) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        fn(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  /**
   * Trap focus within a container (for modals/drawers)
   */
  function trapFocus(container, event) {
    if (event.key !== 'Tab') return;

    const focusableElements = container.querySelectorAll(
      'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    
    if (focusableElements.length === 0) return;

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    if (event.shiftKey) {
      if (document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      }
    } else {
      if (document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    }
  }

  /**
   * Get scroll width to prevent body shift when locking scroll
   */
  function getScrollbarWidth() {
    return window.innerWidth - document.documentElement.clientWidth;
  }

  /* ============================================================
     MOBILE DRAWER CONTROLLER
     ============================================================ */

  const drawer = {
    elements: {},

    init() {
      this.elements.ham = $(CONFIG.selectors.mobHam);
      this.elements.drawer = $(CONFIG.selectors.mobDrawer);
      this.elements.backdrop = $(CONFIG.selectors.mobBackdrop);
      this.elements.close = $(CONFIG.selectors.mobClose);

      if (!this.elements.ham || !this.elements.drawer) {
        console.warn('Mobile drawer elements not found');
        return false;
      }

      this.bindEvents();
      return true;
    },

    bindEvents() {
      // Hamburger opens drawer
      this.elements.ham.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.open();
      });

      // Close button closes drawer
      this.elements.close?.addEventListener('click', (e) => {
        e.preventDefault();
        this.close();
      });

      // Backdrop closes drawer
      this.elements.backdrop?.addEventListener('click', (e) => {
        this.close();
      });

      // Keyboard support
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && state.drawerOpen) {
          this.close();
        }
      });

      // Focus trap
      this.elements.drawer.addEventListener('keydown', (e) => {
        if (state.drawerOpen) {
          trapFocus(this.elements.drawer, e);
        }
      });
    },

    open() {
      if (state.isAnimating || state.drawerOpen) return;
      state.isAnimating = true;

      // Update ARIA
      this.elements.ham.setAttribute(CONFIG.attributes.ariaExpanded, 'true');
      this.elements.drawer.setAttribute(CONFIG.attributes.ariaHidden, 'false');
      
      // Remove hidden, add open class for animation
      this.elements.drawer.removeAttribute(CONFIG.attributes.hidden);
      this.elements.backdrop?.removeAttribute(CONFIG.attributes.hidden);
      
      // Force reflow for transition
      void this.elements.drawer.offsetHeight;
      
      this.elements.drawer.classList.add(CONFIG.classes.isOpen);
      this.elements.backdrop?.classList.add(CONFIG.classes.isOpen);
      
      // Lock body scroll
      document.body.classList.add(CONFIG.classes.bodyMenuOpen);
      document.body.style.paddingRight = `${getScrollbarWidth()}px`;

      // Focus management
      setTimeout(() => {
        const firstFocusable = this.elements.drawer.querySelector(
          'button, a[href], input, select, textarea'
        );
        firstFocusable?.focus();
        state.drawerOpen = true;
        state.isAnimating = false;
      }, 50);
    },

    close() {
      if (!state.drawerOpen || state.isAnimating) return;
      state.isAnimating = true;

      // Update ARIA
      this.elements.ham.setAttribute(CONFIG.attributes.ariaExpanded, 'false');
      this.elements.drawer.setAttribute(CONFIG.attributes.ariaHidden, 'true');

      // Remove open classes
      this.elements.drawer.classList.remove(CONFIG.classes.isOpen);
      this.elements.backdrop?.classList.remove(CONFIG.classes.isOpen);

      // Unlock body scroll
      document.body.classList.remove(CONFIG.classes.bodyMenuOpen);
      document.body.style.paddingRight = '';

      // Close all accordions inside drawer
      accordion.closeAll();

      // Wait for transition, then hide
      setTimeout(() => {
        this.elements.drawer.setAttribute(CONFIG.attributes.hidden, '');
        this.elements.backdrop?.setAttribute(CONFIG.attributes.hidden, '');
        
        // Return focus to hamburger
        this.elements.ham.focus();
        
        state.drawerOpen = false;
        state.isAnimating = false;
      }, 300);
    }
  };

  /* ============================================================
     MOBILE SEARCH CONTROLLER
     ============================================================ */

  const mobileSearch = {
    elements: {},

    init() {
      this.elements.btn = $(CONFIG.selectors.mobSearchBtn);
      this.elements.bar = $(CONFIG.selectors.mobSearchBar);

      if (!this.elements.btn || !this.elements.bar) return false;

      this.bindEvents();
      return true;
    },

    bindEvents() {
      this.elements.btn.addEventListener('click', (e) => {
        e.preventDefault();
        this.toggle();
      });
    },

    toggle() {
      state.searchOpen = !state.searchOpen;

      this.elements.btn.setAttribute(CONFIG.attributes.ariaExpanded, state.searchOpen);
      this.elements.bar.setAttribute(CONFIG.attributes.ariaHidden, !state.searchOpen);

      if (state.searchOpen) {
        this.elements.bar.removeAttribute(CONFIG.attributes.hidden);
        // Force reflow
        void this.elements.bar.offsetHeight;
        this.elements.bar.classList.add(CONFIG.classes.isOpen);
        
        const input = this.elements.bar.querySelector('input');
        setTimeout(() => input?.focus(), 100);
      } else {
        this.elements.bar.classList.remove(CONFIG.classes.isOpen);
        setTimeout(() => {
          this.elements.bar.setAttribute(CONFIG.attributes.hidden, '');
        }, 300);
      }
    },

    close() {
      if (!state.searchOpen) return;
      this.toggle();
    }
  };

  /* ============================================================
     MEGA MENU CONTROLLER
     ============================================================ */

  const megaMenu = {
    elements: {},

    init() {
      this.elements.btn = $(CONFIG.selectors.allBtn);
      this.elements.menu = $(CONFIG.selectors.megaMenu);

      if (!this.elements.btn || !this.elements.menu) return false;

      this.bindEvents();
      return true;
    },

    bindEvents() {
      // Toggle on click
      this.elements.btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.toggle();
      });

      // Close on outside click
      document.addEventListener('click', (e) => {
        if (state.megaOpen && 
            !this.elements.btn.contains(e.target) && 
            !this.elements.menu.contains(e.target)) {
          this.close();
        }
      });

      // Keyboard support
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && state.megaOpen) {
          this.close();
          this.elements.btn.focus();
        }
      });
    },

    toggle() {
      state.megaOpen ? this.close() : this.open();
    },

    open() {
      state.megaOpen = true;
      
      this.elements.btn.setAttribute(CONFIG.attributes.ariaExpanded, 'true');
      this.elements.menu.setAttribute(CONFIG.attributes.ariaHidden, 'false');
      this.elements.menu.removeAttribute(CONFIG.attributes.hidden);
      
      // Force reflow
      void this.elements.menu.offsetHeight;
      this.elements.menu.classList.add(CONFIG.classes.isOpen);
    },

    close() {
      state.megaOpen = false;
      
      this.elements.btn.setAttribute(CONFIG.attributes.ariaExpanded, 'false');
      this.elements.menu.setAttribute(CONFIG.attributes.ariaHidden, 'true');
      this.elements.menu.classList.remove(CONFIG.classes.isOpen);
      
      setTimeout(() => {
        this.elements.menu.setAttribute(CONFIG.attributes.hidden, '');
      }, 200);
    }
  };

  /* ============================================================
     ACCORDION CONTROLLER
     ============================================================ */

  const accordion = {
    toggles: [],

    init() {
      this.toggles = $$(CONFIG.selectors.accToggles);
      if (this.toggles.length === 0) return false;

      this.bindEvents();
      return true;
    },

    bindEvents() {
      this.toggles.forEach(toggle => {
        toggle.addEventListener('click', (e) => {
          e.preventDefault();
          this.toggle(toggle);
        });
      });
    },

    toggle(targetToggle) {
      const panelId = targetToggle.getAttribute('aria-controls');
      const panel = document.getElementById(panelId);
      
      if (!panel) return;

      const isExpanded = targetToggle.getAttribute(CONFIG.attributes.ariaExpanded) === 'true';

      // Close others (optional - remove if multiple open accordions desired)
      this.toggles.forEach(toggle => {
        if (toggle !== targetToggle) {
          toggle.setAttribute(CONFIG.attributes.ariaExpanded, 'false');
          const otherPanel = document.getElementById(toggle.getAttribute('aria-controls'));
          if (otherPanel) {
            otherPanel.classList.remove(CONFIG.classes.isOpen);
            otherPanel.setAttribute(CONFIG.attributes.hidden, '');
          }
        }
      });

      // Toggle current
      targetToggle.setAttribute(CONFIG.attributes.ariaExpanded, !isExpanded);
      
      if (!isExpanded) {
        panel.removeAttribute(CONFIG.attributes.hidden);
        // Force reflow
        void panel.offsetHeight;
        panel.classList.add(CONFIG.classes.isOpen);
      } else {
        panel.classList.remove(CONFIG.classes.isOpen);
        setTimeout(() => {
          panel.setAttribute(CONFIG.attributes.hidden, '');
        }, 300);
      }
    },

    closeAll() {
      this.toggles.forEach(toggle => {
        toggle.setAttribute(CONFIG.attributes.ariaExpanded, 'false');
        const panel = document.getElementById(toggle.getAttribute('aria-controls'));
        if (panel) {
          panel.classList.remove(CONFIG.classes.isOpen);
          panel.setAttribute(CONFIG.attributes.hidden, '');
        }
      });
    }
  };

  /* ============================================================
     DESKTOP DROPDOWN CONTROLLER
     ============================================================ */

  const desktopDropdowns = {
    triggers: [],

    init() {
      this.triggers = $$(CONFIG.selectors.dropTriggers);
      if (this.triggers.length === 0) return false;

      this.bindEvents();
      return true;
    },

    bindEvents() {
      this.triggers.forEach(trigger => {
        const parent = trigger.closest('.tw-dropdown');
        if (!parent) return;

        const menu = parent.querySelector('.tw-dropdown-menu');
        if (!menu) return;

        // Click to toggle (for mobile/desktop hybrid)
        trigger.addEventListener('click', (e) => {
          if (window.innerWidth > CONFIG.breakpoints.mobile) {
            e.preventDefault();
            this.toggle(trigger, menu);
          }
        });

        // Hover for desktop
        parent.addEventListener('mouseenter', () => {
          if (window.innerWidth > CONFIG.breakpoints.mobile) {
            this.open(trigger, menu);
          }
        });

        parent.addEventListener('mouseleave', () => {
          if (window.innerWidth > CONFIG.breakpoints.mobile) {
            // Small delay to allow moving to menu
            setTimeout(() => {
              if (!parent.matches(':hover')) {
                this.close(trigger, menu);
              }
            }, 100);
          }
        });

        // Keyboard navigation
        trigger.addEventListener('keydown', (e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            this.open(trigger, menu);
            const firstItem = menu.querySelector('.tw-dropdown-item');
            firstItem?.focus();
          }
          if (e.key === 'Escape') {
            this.close(trigger, menu);
            trigger.focus();
          }
        });

        // Menu item keyboard nav
        const items = menu.querySelectorAll('.tw-dropdown-item');
        items.forEach((item, index) => {
          item.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              items[index + 1]?.focus();
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              if (index === 0) {
                trigger.focus();
              } else {
                items[index - 1]?.focus();
              }
            }
            if (e.key === 'Escape') {
              this.close(trigger, menu);
              trigger.focus();
            }
          });
        });
      });
    },

    toggle(trigger, menu) {
      const isExpanded = trigger.getAttribute(CONFIG.attributes.ariaExpanded) === 'true';
      isExpanded ? this.close(trigger, menu) : this.open(trigger, menu);
    },

    open(trigger, menu) {
      trigger.setAttribute(CONFIG.attributes.ariaExpanded, 'true');
      menu.removeAttribute(CONFIG.attributes.hidden);
      state.activeDropdown = { trigger, menu };
    },

    close(trigger, menu) {
      trigger.setAttribute(CONFIG.attributes.ariaExpanded, 'false');
      menu.setAttribute(CONFIG.attributes.hidden, '');
      if (state.activeDropdown?.trigger === trigger) {
        state.activeDropdown = null;
      }
    },

    closeAll() {
      this.triggers.forEach(trigger => {
        const parent = trigger.closest('.tw-dropdown');
        const menu = parent?.querySelector('.tw-dropdown-menu');
        if (menu) {
          this.close(trigger, menu);
        }
      });
    }
  };

  /* ============================================================
     ACCOUNT DROPDOWN CONTROLLER
     ============================================================ */

  const accountDropdown = {
    init() {
      const triggers = $$(CONFIG.selectors.actionTriggers);
      
      triggers.forEach(trigger => {
        const dropdown = document.getElementById(trigger.getAttribute('aria-controls'));
        if (!dropdown) return;

        // Toggle on click
        trigger.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          
          const isExpanded = trigger.getAttribute(CONFIG.attributes.ariaExpanded) === 'true';
          
          // Close all others first
          triggers.forEach(t => {
            if (t !== trigger) {
              t.setAttribute(CONFIG.attributes.ariaExpanded, 'false');
              const d = document.getElementById(t.getAttribute('aria-controls'));
              d?.setAttribute(CONFIG.attributes.hidden, '');
            }
          });

          trigger.setAttribute(CONFIG.attributes.ariaExpanded, !isExpanded);
          
          if (!isExpanded) {
            dropdown.removeAttribute(CONFIG.attributes.hidden);
          } else {
            dropdown.setAttribute(CONFIG.attributes.hidden, '');
          }
        });
      });

      // Close on outside click
      document.addEventListener('click', (e) => {
        triggers.forEach(trigger => {
          const parent = trigger.closest('.tw-dropdown-wrapper');
          if (parent && !parent.contains(e.target)) {
            trigger.setAttribute(CONFIG.attributes.ariaExpanded, 'false');
            const dropdown = document.getElementById(trigger.getAttribute('aria-controls'));
            dropdown?.setAttribute(CONFIG.attributes.hidden, '');
          }
        });
      });
    }
  };

  /* ============================================================
     RESIZE HANDLER
     ============================================================ */

  const resizeHandler = {
    init() {
      window.addEventListener('resize', debounce(() => {
        this.handleResize();
      }, 150));
    },

    handleResize() {
      const isDesktop = window.innerWidth > CONFIG.breakpoints.mobile;

      // Close mobile elements when going desktop
      if (isDesktop) {
        if (state.drawerOpen) drawer.close();
        if (state.searchOpen) mobileSearch.close();
      } else {
        // Close desktop dropdowns when going mobile
        desktopDropdowns.closeAll();
        if (state.megaOpen) megaMenu.close();
      }
    }
  };

  /* ============================================================
     INITIALIZATION
     ============================================================ */

  function init() {
    // Initialize all modules
    const modules = [
      { name: 'drawer', instance: drawer },
      { name: 'mobileSearch', instance: mobileSearch },
      { name: 'megaMenu', instance: megaMenu },
      { name: 'accordion', instance: accordion },
      { name: 'desktopDropdowns', instance: desktopDropdowns },
      { name: 'accountDropdown', instance: accountDropdown },
      { name: 'resizeHandler', instance: resizeHandler }
    ];

    modules.forEach(({ name, instance }) => {
      try {
        const initialized = instance.init();
        if (initialized === false) {
          console.warn(`Module ${name} skipped: elements not found`);
        }
      } catch (error) {
        console.error(`Module ${name} failed to initialize:`, error);
      }
    });

    console.log('TayariWeb Navbar initialized');
  }

  // Boot when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();