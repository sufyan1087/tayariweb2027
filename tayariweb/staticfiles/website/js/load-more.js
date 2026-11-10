// load-more.js
document.addEventListener('DOMContentLoaded', function() {
    const btn = document.getElementById('loadMoreBtn');
    if (!btn) return;
    
    btn.addEventListener('click', async function() {
        const nextPage = this.dataset.nextPage;
        const category = this.dataset.category;
        const sort = this.dataset.sort;
        
        this.disabled = true;
        
        const params = new URLSearchParams({ page: nextPage });
        if (category) params.append('category', category);
        if (sort) params.append('sort', sort);
        
        try {
            const response = await fetch(`?${params.toString()}`, {
                headers: { 'X-Requested-With': 'XMLHttpRequest' }
            });
            const html = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            const items = doc.querySelectorAll('.blog-list-item');
            
            if (items.length === 0) {
                this.remove();
                return;
            }
            
            const container = document.getElementById('itemsList');
            items.forEach(item => container.appendChild(item.cloneNode(true)));
            
            this.dataset.nextPage = parseInt(nextPage) + 1;
            this.disabled = false;
            
        } catch (error) {
            this.disabled = false;
            console.error('Load more failed:', error);
        }
    });
});