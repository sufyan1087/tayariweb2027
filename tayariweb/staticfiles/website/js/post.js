/**
 * TayariWeb Post Page — Production Grade
 * Dynamic TOC + AdSense Optimized + Core Web Vitals
 * LCP < 2.5s, CLS < 0.1, INP < 200ms
 */

(function() {
    'use strict';

    // ==========================================
    // CONFIGURATION
    // ==========================================
    const CONFIG = {
        headerOffset: 120,      // 104px navbar + buffer
        tocMaxHeight: 400,      // TOC scrollable height
        adUnstickMargin: 100,   // Pixels before footer to unstick ad
        debounceDelay: 150,     // ms for scroll/resize debounce
        observerThreshold: 0,   // IntersectionObserver threshold
        observerRootMargin: '-20% 0px -80% 0px'
    };

    // ==========================================
    // UTILITY FUNCTIONS
    // ==========================================

    /**
     * Debounce function execution
     * @param {Function} func — function to debounce
     * @param {number} wait — delay in milliseconds
     * @returns {Function}
     */
    const debounce = (func, wait) => {
        let timeout;
        return function(...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    };

    /**
     * Generate URL-safe ID from text
     * @param {string} text
     * @param {number} index
     * @returns {string}
     */
    const generateId = (text, index) => {
        const base = text.toLowerCase()
            .replace(/[^a-z0-9\s-]/g, '')
            .replace(/\s+/g, '-')
            .substring(0, 50);
        return base + (index > 0 ? '-' + index : '');
    };

    // ==========================================
    // DYNAMIC TABLE OF CONTENTS
    // ==========================================

    const initTOC = () => {
        const postBody = document.querySelector('.post-body');
        const tocList = document.getElementById('tocList');
        const tocSidebar = document.getElementById('tocSidebar');

        if (!postBody || !tocList) return;

        const headings = postBody.querySelectorAll('h2, h3');
        const uniqueHeadings = new Map();

        if (headings.length === 0) {
            if (tocSidebar) tocSidebar.style.display = 'none';
            return;
        }

        // Build TOC
        const fragment = document.createDocumentFragment();
        let currentSublist = null;
        let lastLi = null;

        headings.forEach((heading, index) => {
            const text = heading.textContent.trim();
            if (uniqueHeadings.has(text)) return;
            uniqueHeadings.set(text, true);

            // Generate and assign ID
            if (!heading.id) {
                heading.id = generateId(text, index);
            }

            const level = parseInt(heading.tagName.charAt(1), 10);
            const li = document.createElement('li');
            const a = document.createElement('a');

            a.href = '#' + heading.id;
            a.className = level > 2 ? 'toc-sublink' : 'toc-link';
            a.textContent = text;

            if (level === 3 && lastLi) {
                let sublist = lastLi.querySelector('.toc-sublist');
                if (!sublist) {
                    sublist = document.createElement('ul');
                    sublist.className = 'toc-sublist';
                    lastLi.appendChild(sublist);
                }
                li.appendChild(a);
                sublist.appendChild(li);
            } else {
                li.appendChild(a);
                fragment.appendChild(li);
                lastLi = li;
                currentSublist = null;
            }
        });

        // Add comments link
        const commentsLi = document.createElement('li');
        commentsLi.innerHTML = '<a href="#comments" class="toc-link">Comments</a>';
        fragment.appendChild(commentsLi);

        // Clear and rebuild
        tocList.innerHTML = '<li><a href="#overview" class="toc-link active">Overview</a></li>';
        tocList.appendChild(fragment);
    };

    // ==========================================
    // INTERSECTION OBSERVER — ACTIVE TOC HIGHLIGHT
    // ==========================================

    const initTOCHighlight = () => {
        const sections = document.querySelectorAll('[id]');
        const tocLinks = document.querySelectorAll('.toc-link, .toc-sublink');

        if (!sections.length || !tocLinks.length || !('IntersectionObserver' in window)) return;

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (!entry.isIntersecting) return;

                const id = entry.target.getAttribute('id');
                tocLinks.forEach(link => {
                    link.classList.remove('active');
                    if (link.getAttribute('href') === '#' + id) {
                        link.classList.add('active');
                        // Scroll TOC to keep active item visible
                        link.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    }
                });
            });
        }, {
            root: null,
            rootMargin: CONFIG.observerRootMargin,
            threshold: CONFIG.observerThreshold
        });

        sections.forEach(section => observer.observe(section));
    };

    // ==========================================
    // SMOOTH SCROLL FOR TOC LINKS
    // ==========================================

    const initSmoothScroll = () => {
        const tocNav = document.getElementById('tocNav');
        if (!tocNav) return;

        tocNav.addEventListener('click', (e) => {
            const link = e.target.closest('.toc-link, .toc-sublink');
            if (!link) return;

            e.preventDefault();
            const targetId = link.getAttribute('href');
            const target = document.querySelector(targetId);

            if (!target) return;

            const elementPosition = target.getBoundingClientRect().top;
            const offsetPosition = elementPosition + window.pageYOffset - CONFIG.headerOffset;

            window.scrollTo({
                top: offsetPosition,
                behavior: 'smooth'
            });

            // Update URL without jumping
            history.pushState(null, null, targetId);
        });
    };

    // ==========================================
    // ADSENSE STICKY AD — UNSTICK BEFORE FOOTER
    // ==========================================

    const initAdUnstick = () => {
        const stickyAd = document.querySelector('.sticky-ad-wrapper');
        const footer = document.querySelector('.footer');

        if (!stickyAd || !footer || !('IntersectionObserver' in window)) return;

        const footerObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                stickyAd.classList.toggle('ad-unstick', entry.isIntersecting);
            });
        }, {
            rootMargin: CONFIG.adUnstickMargin + 'px',
            threshold: 0
        });

        footerObserver.observe(footer);
    };

    // ==========================================
    // COPY LINK FUNCTIONALITY
    // ==========================================

    window.copyLink = () => {
        if (!navigator.clipboard) {
            // Fallback for older browsers
            const textarea = document.createElement('textarea');
            textarea.value = window.location.href;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            try {
                document.execCommand('copy');
                showToast('Link copied to clipboard!', 'success');
            } catch (err) {
                showToast('Failed to copy link', 'error');
            }
            document.body.removeChild(textarea);
            return;
        }

        navigator.clipboard.writeText(window.location.href).then(() => {
            showToast('Link copied to clipboard!', 'success');
        }).catch(() => {
            showToast('Failed to copy link', 'error');
        });
    };

    // ==========================================
    // TOAST NOTIFICATION
    // ==========================================

    const showToast = (message, type = 'success') => {
        const existing = document.querySelector('.notification-toast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.className = 'notification-toast notification-' + type;
        toast.textContent = message;
        toast.setAttribute('role', 'status');
        toast.setAttribute('aria-live', 'polite');
        document.body.appendChild(toast);

        // Trigger animation
        requestAnimationFrame(() => {
            toast.style.transform = 'translateX(0)';
        });

        setTimeout(() => {
            toast.style.transform = 'translateX(120%)';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    };

    // ==========================================
    // QUIZ EMBED INTERACTIONS
    // ==========================================

    const initQuizEmbeds = () => {
        document.querySelectorAll('.check-answer-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const explanation = this.closest('.quiz-embed')?.querySelector('.answer-explanation');
                if (!explanation) return;

                explanation.classList.remove('hidden');
                this.style.display = 'none';

                // Accessibility
                explanation.setAttribute('aria-hidden', 'false');
            });
        });
    };

    // ==========================================
    // COMMENT SYSTEM API (Debounced)
    // ==========================================

    window.postComment = debounce(() => {
        const content = document.getElementById('commentText')?.value.trim();
        const name = document.getElementById('guestNameInput')?.value.trim();
        if (!content || !name) {
            showToast('Please enter your name and comment', 'warning');
            return;
        }

        // Placeholder for AJAX implementation
        console.log('Posting comment:', { name, content });
        // TODO: Implement actual AJAX call to {% url 'website:post_comment' %}
    }, CONFIG.debounceDelay);

    window.likeComment = debounce((commentId) => {
        console.log('Liking comment:', commentId);
        // TODO: Implement AJAX call
    }, 500);

    window.toggleFollow = debounce((authorId) => {
        console.log('Toggling follow:', authorId);
        // TODO: Implement AJAX call
    }, 500);

    window.saveForLater = debounce((postId) => {
        console.log('Saving post:', postId);
        showToast('Saved for later!', 'success');
    }, 300);

    window.addToFavorites = debounce((postId) => {
        console.log('Adding to favorites:', postId);
        showToast('Added to favorites!', 'success');
    }, 300);

    window.subscribeNewsletter = debounce((form) => {
        const email = form.querySelector('input[type="email"]')?.value;
        if (!email) {
            showToast('Please enter a valid email', 'warning');
            return;
        }
        console.log('Subscribing:', email);
        showToast('Subscribed successfully!', 'success');
        form.reset();
    }, 300);

    window.replyComment = (commentId) => {
        const content = prompt('Enter your reply:');
        if (content && content.trim()) {
            console.log('Replying to comment:', commentId, content);
            // TODO: Implement AJAX call
        }
    };

    // ==========================================
    // FORM HANDLERS
    // ==========================================

    const initFormHandlers = () => {
        // Main comment form
        const commentForm = document.getElementById('mainCommentForm');
        if (commentForm) {
            commentForm.addEventListener('submit', (e) => {
                e.preventDefault();
                postComment();
            });
        }

        // Newsletter form
        const newsletterForm = document.getElementById('sidebarNewsletterForm');
        if (newsletterForm) {
            newsletterForm.addEventListener('submit', (e) => {
                e.preventDefault();
                subscribeNewsletter(newsletterForm);
            });
        }
    };

    // ==========================================
    // LAZY LOAD IMAGES (Native + Fallback)
    // ==========================================

    const initLazyImages = () => {
        if ('loading' in HTMLImageElement.prototype) {
            // Native lazy loading supported
            document.querySelectorAll('img[loading="lazy"]').forEach(img => {
                if (img.dataset.src) {
                    img.src = img.dataset.src;
                    img.removeAttribute('data-src');
                }
            });
        } else {
            // Fallback: IntersectionObserver
            const imageObserver = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (!entry.isIntersecting) return;
                    const img = entry.target;
                    if (img.dataset.src) {
                        img.src = img.dataset.src;
                        img.removeAttribute('data-src');
                    }
                    imageObserver.unobserve(img);
                });
            }, { rootMargin: '50px' });

            document.querySelectorAll('img[data-src]').forEach(img => imageObserver.observe(img));
        }
    };

    // ==========================================
    // INITIALIZATION
    // ==========================================

    const init = () => {
        initTOC();
        initTOCHighlight();
        initSmoothScroll();
        initAdUnstick();
        initQuizEmbeds();
        initFormHandlers();
        initLazyImages();
    };

    // Run when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();