# website/templatetags/vite_tags.py
import json
import os
from django import template
from django.conf import settings

register = template.Library()

@register.simple_tag
def vite_asset(entry_name):
    """
    Reads Vite manifest.json and returns the correct hashed filename.
    Usage: {% vite_asset 'quiz' %}
    """
    # Try multiple possible paths for manifest.json
    possible_paths = [
        os.path.join(settings.BASE_DIR, 'static', 'js', 'bundles', '.vite', 'manifest.json'),
        os.path.join(settings.BASE_DIR, 'static', 'js', 'bundles', 'manifest.json'),
        os.path.join(settings.BASE_DIR, 'staticfiles', 'js', 'bundles', '.vite', 'manifest.json'),
    ]
    
    manifest = None
    for path in possible_paths:
        try:
            with open(path, 'r') as f:
                manifest = json.load(f)
                break
        except (FileNotFoundError, json.JSONDecodeError):
            continue
    
    if manifest and entry_name in manifest:
        file_path = manifest[entry_name]['file']
        return f"{settings.STATIC_URL}js/bundles/{file_path}"
    
    # Fallback: return unhashed path (for development)
    return f"{settings.STATIC_URL}js/bundles/{entry_name}.js"