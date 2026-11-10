// script.js - 4 SIDEBARS + MONETIZATION

document.addEventListener('DOMContentLoaded', function() {
    
    // ==========================================
    // MOBILE MENU
    // ==========================================
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const mainContainer = document.querySelector('.main-container');
    let isMenuOpen = false;

    if (mobileMenuBtn) {
        mobileMenuBtn.addEventListener('click', function() {
            isMenuOpen = !isMenuOpen;
            
            if (isMenuOpen) {
                mainContainer.style.display = 'flex';
                mainContainer.style.position = 'fixed';
                mainContainer.style.top = '0';
                mainContainer.style.left = '0';
                mainContainer.style.right = '0';
                mainContainer.style.bottom = '0';
                mainContainer.style.background = 'rgba(255,255,255,0.98)';
                mainContainer.style.zIndex = '999';
                mainContainer.style.overflowY = 'auto';
                mainContainer.style.padding = '80px 20px 20px';
                mainContainer.style.flexDirection = 'column';
            } else {
                mainContainer.style = '';
            }

            const spans = mobileMenuBtn.querySelectorAll('span');
            spans[0].style.transform = isMenuOpen ? 'rotate(45deg) translate(5px, 5px)' : '';
            spans[1].style.opacity = isMenuOpen ? '0' : '1';
            spans[2].style.transform = isMenuOpen ? 'rotate(-45deg) translate(7px, -6px)' : '';
        });
    }

    // ==========================================
    // PRICING TOGGLE
    // ==========================================
    const toggleBtns = document.querySelectorAll('.toggle-btn');
    const priceAmount = document.getElementById('priceAmount');
    
    toggleBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            toggleBtns.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            
            const plan = this.dataset.plan;
            if (plan === 'yearly') {
                priceAmount.textContent = '119';
                document.querySelector('.period').textContent = '/month (billed annually)';
            } else {
                priceAmount.textContent = '199';
                document.querySelector('.period').textContent = '/month';
            }
        });
    });

    // ==========================================
    // SEARCH FUNCTIONALITY
    // ==========================================
    const searchInput = document.querySelector('.search-input');
    const searchBtn = document.querySelector('.search-btn');

    if (searchBtn && searchInput) {
        const performSearch = () => {
            const query = searchInput.value.trim().toLowerCase();
            const cards = document.querySelectorAll('.card');
            
            cards.forEach(card => {
                const text = card.textContent.toLowerCase();
                card.style.display = text.includes(query) ? 'block' : 'none';
            });
        };

        searchBtn.addEventListener('click', performSearch);
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') performSearch();
        });
    }

    // ==========================================
    // CARD INTERACTIONS
    // ==========================================
    document.querySelectorAll('.card').forEach(card => {
        card.addEventListener('click', function() {
            const title = this.querySelector('.card-title').textContent;
            showNotification(`Opening ${title}...`, 'success');
        });
    });

    // ==========================================
    // NOTIFICATION SYSTEM
    // ==========================================
    function showNotification(message, type = 'info') {
        const existing = document.querySelector('.notification');
        if (existing) existing.remove();

        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 120px;
            right: 20px;
            background: ${type === 'success' ? '#10b981' : '#3b82f6'};
            color: white;
            padding: 1rem 1.5rem;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 10000;
            font-weight: 500;
            animation: slideIn 0.3s ease;
        `;
        notification.textContent = message;
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    // Add keyframes
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        @keyframes slideOut { from { transform: translateX(0); opacity: 1; } to { transform: translateX(100%); opacity: 0; } }
    `;
    document.head.appendChild(style);

    // ==========================================
    // INTERSTITIAL AD (Show after 10 seconds)
    // ==========================================
    setTimeout(() => {
        const interstitial = document.getElementById('interstitialAd');
        if (interstitial && !sessionStorage.getItem('adShown')) {
            interstitial.classList.remove('hidden');
            sessionStorage.setItem('adShown', 'true');
        }
    }, 10000);

    // ==========================================
    // SCROLL ANIMATIONS
    // ==========================================
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, { threshold: 0.1 });

    document.querySelectorAll('.service-card, .ad-section').forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(20px)';
        el.style.transition = 'all 0.6s ease';
        observer.observe(el);
    });

    // ==========================================
    // AFFILIATE LINK TRACKING
    // ==========================================
    document.querySelectorAll('a[rel*="sponsored"]').forEach(link => {
        link.addEventListener('click', function(e) {
            // Track affiliate clicks (replace with your analytics)
            console.log('Affiliate click:', this.href);
            
            // Optional: Add delay for tracking
            if (this.target !== '_blank') {
                e.preventDefault();
                setTimeout(() => {
                    window.location.href = this.href;
                }, 100);
            }
        });
    });

    console.log('TayariWeb with 4 sidebars loaded! 🚀');
});

// Post page specific functionality

document.addEventListener('DOMContentLoaded', function() {
    
    // Table of Contents Active State on Scroll
    const sections = document.querySelectorAll('section[id]');
    const tocLinks = document.querySelectorAll('.toc-link, .toc-sublink');
    
    if (sections.length > 0) {
        window.addEventListener('scroll', () => {
            let current = '';
            sections.forEach(section => {
                const sectionTop = section.offsetTop;
                const sectionHeight = section.clientHeight;
                if (pageYOffset >= (sectionTop - 200)) {
                    current = section.getAttribute('id');
                }
            });
            
            tocLinks.forEach(link => {
                link.classList.remove('active');
                if (link.getAttribute('href') === '#' + current) {
                    link.classList.add('active');
                }
            });
        });
    }
    
    // Smooth scroll for TOC links
    document.querySelectorAll('.toc-link, .toc-sublink').forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const targetId = this.getAttribute('href');
            const targetSection = document.querySelector(targetId);
            if (targetSection) {
                const offsetTop = targetSection.offsetTop - 150;
                window.scrollTo({
                    top: offsetTop,
                    behavior: 'smooth'
                });
            }
        });
    });
    
    // Quiz Answer Check
    const checkAnswerBtn = document.querySelector('.check-answer-btn');
    if (checkAnswerBtn) {
        checkAnswerBtn.addEventListener('click', function() {
            const explanation = document.querySelector('.answer-explanation');
            if (explanation) {
                explanation.classList.remove('hidden');
                this.style.display = 'none';
            }
        });
    }
    
    // Copy Link Functionality
    const copyBtn = document.querySelector('.share-btn.copy');
    if (copyBtn) {
        copyBtn.addEventListener('click', function(e) {
            e.preventDefault();
            navigator.clipboard.writeText(window.location.href).then(() => {
                alert('Link copied to clipboard!');
            });
        });
    }
    
    // Follow Button Toggle
    const followBtn = document.querySelector('.follow-btn');
    if (followBtn) {
        followBtn.addEventListener('click', function() {
            if (this.textContent === '+ Follow') {
                this.textContent = '✓ Following';
                this.style.background = 'var(--primary-color)';
                this.style.color = 'white';
            } else {
                this.textContent = '+ Follow';
                this.style.background = 'transparent';
                this.style.color = 'var(--primary-color)';
            }
        });
    }
    
    // Reading Progress Update
    const progressFill = document.querySelector('.progress-fill');
    if (progressFill) {
        window.addEventListener('scroll', () => {
            const winScroll = document.body.scrollTop || document.documentElement.scrollTop;
            const height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
            const scrolled = (winScroll / height) * 100;
            progressFill.style.width = scrolled + '%';
        });
    }
    
});