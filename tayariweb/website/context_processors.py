def breadcrumb_context(request):
    """Auto-generate breadcrumb based on URL path"""
    path = request.path.strip('/').split('/')
    breadcrumb_items = []
    
    # Build breadcrumb dynamically
    for i, segment in enumerate(path):
        if segment:
            breadcrumb_items.append({
                'name': segment.replace('-', ' ').title(),
                'url': '/' + '/'.join(path[:i+1]) if i < len(path) - 1 else None
            })
    
    return {'breadcrumb_list': breadcrumb_items}