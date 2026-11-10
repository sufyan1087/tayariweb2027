// Lazy load ads when visible
const adObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting && !entry.target.dataset.loaded) {
            entry.target.dataset.loaded = 'true';
            if (typeof adsbygoogle !== 'undefined') {
                adsbygoogle.push({});
            }
        }
    });
}, { rootMargin: '100px' });

document.querySelectorAll('[data-ad-slot]').forEach(ad => {
    adObserver.observe(ad);
});