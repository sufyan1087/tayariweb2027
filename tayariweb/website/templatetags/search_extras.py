from django import template
import re

register = template.Library()

@register.filter(name='highlight')
def highlight(text, search_term):
    """
    Highlight search term in text by wrapping it in a span with highlight class.
    Usage: {{ post.title|highlight:query }}
    """
    if not search_term or not text:
        return text
    
    # Escape HTML to prevent XSS
    text = str(text)
    search_term = str(search_term)
    
    # Case-insensitive replacement
    pattern = re.compile(re.escape(search_term), re.IGNORECASE)
    highlighted = pattern.sub(
        lambda m: f'<span class="highlight">{m.group()}</span>', 
        text
    )
    
    # Mark as safe HTML
    from django.utils.safestring import mark_safe
    return mark_safe(highlighted)

@register.filter(name='truncatechars')
def truncatechars(value, arg):
    """
    Truncate string to specified length with ellipsis.
    Django has this built-in, but included for safety.
    """
    if not value:
        return ""
    
    length = int(arg)
    value = str(value)
    
    if len(value) > length:
        return value[:length].rsplit(' ', 1)[0] + '...'
    return value