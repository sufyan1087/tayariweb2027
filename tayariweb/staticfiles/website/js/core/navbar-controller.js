/**
 * TAYARIWEB NAVBAR CONTROLLER v3.0
 * Deployment Ready | AdSense Compatible | SEO Optimized
 */

(function() {
    'use strict';

    // Prevent double initialization
    if (window.TayariNavController) return;
    window.TayariNavController = true;

    const CONFIG = {
        scrollThreshold: 60,
        focusableSelectors: 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'
    };

    const elements = {
        header: document.getElementById('headerTop'),
        siteTitle: document.getElementById('siteTitle'),
        navPlaceholder: document.getElementById('navTitlePlaceholder'),
        mobileToggle: document.getElementById('mobileMenuToggle'),
        mobileDrawer: document.getElementById('mobileNavDrawer'),
        mobileBackdrop: document.getElementById('mobileNavBackdrop'),
        dropdowns: document.querySelectorAll('[data-dropdown]'),
        mobileDropdowns: document.querySelectorAll('[data-mobile-dropdown]')
    };

    const state = {
        isMobileOpen: false,
        scrollRaf: null,
        previouslyFocused: null,
        focusableElements: []
    };

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const isTouchDevice = window.matchMedia('(hover: none)').matches;

    function init() {
        if (!elements.header || !elements.siteTitle) {
            console.warn('[TayariNav] Critical elements not found');
            return;
        }

        initScrollAnimation();
        initMobileMenu();
        initDropdowns();
        initAccessibility();

        console.log('[TayariNav] Initialized');
    }

    function initScrollAnimation() {
        if (prefersReducedMotion) {
            elements.siteTitle.classList.add('title-hidden');
            elements.navPlaceholder?.classList.add('visible');
            elements.header.style.opacity = '0';
            elements.header.style.pointerEvents = 'none';
            return;
        }

        const updateScrollState = () => {
            const scrollY = window.scrollY;
            const progress = Math.min(scrollY / CONFIG.scrollThreshold, 1);
            const isScrolled = progress > 0.5;

            elements.siteTitle.classList.toggle('title-hidden', isScrolled);
            elements.navPlaceholder?.classList.toggle('visible', isScrolled);

            elements.header.style.opacity = 1 - progress;
            elements.header.style.pointerEvents = progress > 0.9 ? 'none' : 'auto';

            state.scrollRaf = null;
        };

        const onScroll = () => {
            if (state.scrollRaf) return;
            state.scrollRaf = requestAnimationFrame(updateScrollState);
        };

        window.addEventListener('scroll', onScroll, { passive: true });
        updateScrollState();

        document.addEventListener('visibilitychange', () => {
            if (document.hidden && state.scrollRaf) {
                cancelAnimationFrame(state.scrollRaf);
                state.scrollRaf = null;
            }
        });
    }

    function initMobileMenu() {
        if (!elements.mobileToggle || !elements.mobileDrawer) return;

        state.focusableElements = Array.from(
            elements.mobileDrawer.querySelectorAll(CONFIG.focusableSelectors)
        );

        const toggleMenu = () => {
            state.isMobileOpen = !state.isMobileOpen;

            elements.mobileToggle.setAttribute('aria-expanded', state.isMobileOpen);
            elements.mobileDrawer.setAttribute('aria-hidden', !state.isMobileOpen);
            elements.mobileDrawer.classList.toggle('active', state.isMobileOpen);
            elements.mobileBackdrop?.classList.toggle('active', state.isMobileOpen);

            document.body.style.overflow = state.isMobileOpen ? 'hidden' : '';
            document.body.style.touchAction = state.isMobileOpen ? 'none' : '';

            if (state.isMobileOpen) {
                state.previouslyFocused = document.activeElement;
                if (state.focusableElements.length > 0) {
                    setTimeout(() => state.focusableElements[0].focus(), 100);
                }
            } else {
                state.previouslyFocused?.focus();
            }
        };

        elements.mobileToggle.addEventListener('click', toggleMenu);
        elements.mobileBackdrop?.addEventListener('click', toggleMenu);

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && state.isMobileOpen) toggleMenu();
        });
    }

    function initDropdowns() {
        elements.dropdowns.forEach(dropdown => {
            const toggle = dropdown.querySelector('.dropdown-toggle');
            if (!toggle) return;

            toggle.addEventListener('click', (e) => {
                if (isTouchDevice) {
                    e.preventDefault();
                    const isOpen = dropdown.getAttribute('data-open') === 'true';
                    
                    elements.dropdowns.forEach(d => {
                        if (d !== dropdown) {
                            d.setAttribute('data-open', 'false');
                            d.querySelector('.dropdown-toggle')?.setAttribute('aria-expanded', 'false');
                        }
                    });
                    
                    dropdown.setAttribute('data-open', !isOpen);
                    toggle.setAttribute('aria-expanded', !isOpen);
                }
            });
        });

        elements.mobileDropdowns.forEach(dropdown => {
            const toggle = dropdown.querySelector('.mobile-dropdown-toggle');
            if (!toggle) return;

            toggle.addEventListener('click', () => {
                const isOpen = dropdown.getAttribute('data-open') === 'true';
                dropdown.setAttribute('data-open', !isOpen);
                toggle.setAttribute('aria-expanded', !isOpen);
            });
        });

        document.addEventListener('click', (e) => {
            elements.dropdowns.forEach(dropdown => {
                if (!dropdown.contains(e.target)) {
                    dropdown.setAttribute('data-open', 'false');
                    dropdown.querySelector('.dropdown-toggle')?.setAttribute('aria-expanded', 'false');
                }
            });
        });
    }

    function initAccessibility() {
        if (!elements.mobileDrawer) return;

        elements.mobileDrawer.addEventListener('keydown', (e) => {
            if (e.key !== 'Tab' || !state.isMobileOpen || state.focusableElements.length === 0) return;

            const first = state.focusableElements[0];
            const last = state.focusableElements[state.focusableElements.length - 1];

            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();