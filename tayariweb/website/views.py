"""
TayariWeb Website Views
SEO-optimized, AdSense-compliant, performance-tuned content management
"""

from django.shortcuts import get_object_or_404, render
from django.http import JsonResponse, Http404
from django.db.models import Count, Q, F
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_POST
from django.core.paginator import Paginator
from django.utils import timezone
from django.core.cache import cache
from django.conf import settings
from django.utils.html import strip_tags

from .models import (
    Category, Post, Author, AdSection, TrendingTopic,
    Comment, NewsletterSubscriber,
    Job, Scholarship, Course
)


# ==================== CACHE STRATEGY ====================
CACHE_TTL = {
    'ads': 300,
    'trending': 600,
    'home': 300,
    'list': 180,
}


def get_cached_ads():
    """Fetch active ads with caching"""
    cache_key = 'active_ads_v2'
    ads = cache.get(cache_key)
    if ads is None:
        ads = {
            'sidebar_sticky': AdSection.objects.filter(position='right_1', is_active=True).first(),
            'sidebar_secondary': AdSection.objects.filter(position='left_1', is_active=True).first(),
            'in_feed': AdSection.objects.filter(position='content_top', is_active=True).first(),
        }
        cache.set(cache_key, ads, CACHE_TTL['ads'])
    return ads


def get_trending_topics():
    """Cached trending topics"""
    cache_key = 'trending_sidebar'
    topics = cache.get(cache_key)
    if topics is None:
        topics = list(TrendingTopic.objects.filter(is_active=True).order_by('rank', '-views')[:5])
        cache.set(cache_key, topics, CACHE_TTL['trending'])
    return topics


# ==================== CONTENT CONFIGURATION ====================
CONTENT_METADATA = {
    'post': {
        'model': Post,
        'url_prefix': 'materials',
        'title': 'Study Materials & Resources',
        'meta_desc': 'Download free study materials for CSS, PMS, ISSB, and competitive exams in Pakistan.',
        'search_placeholder': 'Search CSS notes, PMS guides, ISSB prep...',
        'sort_options': [
            ('latest', 'Latest', '-published_at'),
            ('popular', 'Most Viewed', '-views'),
            ('oldest', 'Oldest', 'published_at'),
        ],
        'default_sort': 'latest',
        'defer_fields': ['content', 'table_of_contents'],
        'date_field': 'published_at',
    },
    'job': {
        'model': Job,
        'url_prefix': 'jobs',
        'title': 'Latest Government & Private Jobs',
        'meta_desc': 'Find latest government jobs, private sector careers, and competitive positions in Pakistan.',
        'search_placeholder': 'Search by organization, position...',
        'sort_options': [
            ('latest', 'Latest', '-published_at'),
            ('deadline', 'Deadline', 'deadline'),
            ('popular', 'Most Applied', '-views'),
        ],
        'default_sort': 'latest',
        'defer_fields': ['content', 'eligibility_criteria', 'requirements', 'benefits', 'how_to_apply'],
        'date_field': 'deadline',
        'extra_filter': lambda qs: qs.exclude(deadline__lt=timezone.now().date()),
    },
    'scholarship': {
        'model': Scholarship,
        'url_prefix': 'scholarships',
        'title': 'Fully Funded Scholarships 2024-2025',
        'meta_desc': 'Discover fully funded scholarships for Pakistani students. HEC, international scholarships, undergraduate, masters, and PhD funding.',
        'search_placeholder': 'Search by country, degree level...',
        'sort_options': [
            ('deadline', 'Deadline Approaching', 'deadline'),
            ('latest', 'Recently Added', '-published_at'),
        ],
        'default_sort': 'deadline',
        'defer_fields': ['content', 'eligibility_criteria', 'benefits_details', 'required_documents', 'selection_process'],
        'date_field': 'deadline',
        'extra_filter': lambda qs: qs.exclude(deadline__lt=timezone.now().date()),
    },
    'course': {
        'model': Course,
        'url_prefix': 'courses',
        'title': 'Free Online Courses with Certificates',
        'meta_desc': 'Access free online courses from Coursera, edX, Udemy. Learn programming, data science, business, and digital marketing.',
        'search_placeholder': 'Search Python, Excel, Marketing...',
        'sort_options': [
            ('popular', 'Most Enrolled', '-students_enrolled'),
            ('rating', 'Highest Rated', '-rating'),
            ('latest', 'Newest', '-published_at'),
        ],
        'default_sort': 'popular',
        'defer_fields': ['content', 'syllabus_overview', 'prerequisites', 'skills_gained'],
        'date_field': 'published_at',
    },
}


# ==================== HOME PAGE ====================
def home_view(request):
    """Home page - matched to template expectations"""
    cache_timeout = 300
    
    latest_posts = cache.get_or_set(
        'home_latest_posts',
        lambda: list(Post.objects.filter(
            status='published'
        ).select_related('category', 'author').defer('content').order_by('-published_at')[:5]),
        cache_timeout
    )
    
    featured_posts = cache.get_or_set(
        'home_featured_posts',
        lambda: list(Post.objects.filter(
            status='published', is_featured=True
        ).select_related('category').defer('content').order_by('-published_at')[:4]),
        cache_timeout
    )
    
    latest_jobs = cache.get_or_set(
        'home_latest_jobs',
        lambda: list(Job.objects.filter(
            is_active=True, status='published'
        ).exclude(deadline__lt=timezone.now().date()
        ).select_related('category').defer(
            'content', 'eligibility_criteria', 'requirements', 'benefits', 'how_to_apply'
        ).order_by('-published_at')[:5]),
        cache_timeout
    )
    
    upcoming_scholarships = cache.get_or_set(
        'home_scholarships',
        lambda: list(Scholarship.objects.filter(
            is_active=True, status='published'
        ).exclude(deadline__lt=timezone.now().date()
        ).select_related('category').defer(
            'content', 'eligibility_criteria', 'benefits_details', 'required_documents', 'selection_process'
        ).order_by('deadline')[:5]),
        cache_timeout
    )
    
    latest_courses = cache.get_or_set(
        'home_courses',
        lambda: list(Course.objects.filter(
            is_active=True, status='published'
        ).select_related('category').defer(
            'content', 'syllabus_overview', 'prerequisites', 'skills_gained'
        ).order_by('-published_at')[:5]),
        cache_timeout
    )
    
    ads = get_cached_ads()
    
    context = {
        'latest_posts': latest_posts,
        'featured_posts': featured_posts,
        'latest_jobs': latest_jobs,
        'upcoming_scholarships': upcoming_scholarships,
        'latest_courses': latest_courses,
        'ad_left_1': ads.get('sidebar_secondary'),
        'ad_left_2': None,
        'left_sidebar_1_links': [],
        'left_sidebar_2_links': [],
        'total_posts': len(latest_posts),
        'total_jobs': len(latest_jobs),
    }
    
    return render(request, 'website/dynamic/home_page.html', context)


# ==================== UNIFIED LIST VIEW (FIXED) ====================
def content_list_view(request, content_type):
    """Unified list view - FIXED: display_fields and base_url"""
    if content_type not in CONTENT_METADATA:
        raise Http404(f"Content type '{content_type}' not found")
    
    config = CONTENT_METADATA[content_type]
    model = config['model']
    
    # Build queryset
    qs = model.objects.filter(status='published')
    if hasattr(model, 'is_active'):
        qs = qs.filter(is_active=True)
    
    if 'extra_filter' in config:
        qs = config['extra_filter'](qs)
    
    qs = qs.defer(*config['defer_fields']).select_related('category')
    
    # Sorting
    sort_param = request.GET.get('sort', config['default_sort'])
    sort_field = next(
        (opt[2] for opt in config['sort_options'] if opt[0] == sort_param),
        config['sort_options'][0][2]
    )
    qs = qs.order_by(sort_field)
    
    # Category filter
    category_slug = request.GET.get('category')
    if category_slug:
        qs = qs.filter(category__slug=category_slug)
    
    # Pagination
    paginator = Paginator(qs, 12)
    page = request.GET.get('page', 1)
    
    try:
        items = paginator.page(page)
    except Exception:
        items = paginator.page(1)
    
    # FIXED: Use display_fields (not display_meta) to match template
    for item in items:
        item.display_fields = build_display_fields(item, content_type)
    
    # Categories with counts
    category_counts = get_category_counts(content_type, model)
    
    # FIXED: Add base_url for "All Items" link
    base_path = f'/{config["url_prefix"]}/'
    
    context = {
        'items': items,
        'categories': category_counts,
        'total_items': paginator.count,
        'current_page': items.number,
        'has_more': items.has_next(),
        'has_previous': items.has_previous(),
        'content_type': content_type,
        'page_title': config['title'],
        'meta_description': config['meta_desc'],
        'search_placeholder': config['search_placeholder'],
        'sort_options': [{'value': opt[0], 'label': opt[1]} for opt in config['sort_options']],
        'default_sort': config['default_sort'],
        'current_sort': sort_param,
        'current_category': category_slug,
        'base_url': base_path,  # FIXED: For "All Items" link
        'ads': get_cached_ads(),
        'canonical_url': request.build_absolute_uri(),
        'og_title': f"{config['title']} | TayariWeb",
        'og_description': config['meta_desc'],
    }
    
    if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
        return render(request, 'website/partials/item_list.html', context)
    
    return render(request, 'website/dynamic/content_list.html', context)


def build_display_fields(item, content_type):
    """FIXED: Returns format matching template expectations"""
    fields = []
    
    if content_type == 'job':
        fields = [
            {
                'value': item.deadline.strftime('%b %d, %Y') if item.deadline else 'No deadline',
                'class': 'date',
                'style': 'color: #f87171; font-weight: 600;' if getattr(item, 'is_expiring_soon', False) else ''
            },
            {
                'value': getattr(item, 'organization', 'Government') or 'Government',
                'class': 'category',
                'style': ''
            }
        ]
    elif content_type == 'scholarship':
        fields = [
            {
                'value': item.deadline.strftime('%b %d, %Y') if item.deadline else 'Open',
                'class': 'date',
                'style': 'color: #f87171; font-weight: 600;' if getattr(item, 'is_expiring_soon', False) else ''
            },
            {
                'value': getattr(item, 'provider', getattr(item, 'country', 'International')) or 'International',
                'class': 'category',
                'style': ''
            }
        ]
    elif content_type == 'course':
        fields = [
            {
                'value': f"{getattr(item, 'rating', 'N/A')}/5",
                'class': 'date',
                'style': ''
            },
            {
                'value': getattr(item, 'platform', 'Online') or 'Online',
                'class': 'category',
                'style': ''
            }
        ]
    else:  # post
        fields = [
            {
                'value': item.published_at.strftime('%b %d, %Y'),
                'class': 'date',
                'style': ''
            },
            {
                'value': item.category.name if item.category else 'General',
                'class': 'category',
                'style': ''
            }
        ]
    
    return fields


def get_category_counts(content_type, model):
    """Get categories with item counts"""
    filter_kwargs = {f'{content_type}_items__status': 'published'}
    if hasattr(model, 'is_active'):
        filter_kwargs[f'{content_type}_items__is_active'] = True
    
    return Category.objects.filter(
        is_active=True, **filter_kwargs
    ).distinct().annotate(
        count=Count(f'{content_type}_items', filter=Q(**filter_kwargs))
    ).filter(count__gt=0).order_by('-count', 'name')


# ==================== UNIFIED DETAIL VIEW (FIXED) ====================
def content_detail_view(request, content_type, slug):
    """Detail view - FIXED: None date handling and template variables"""
    if content_type not in CONTENT_METADATA:
        raise Http404(f"Content type '{content_type}' not found")
    
    config = CONTENT_METADATA[content_type]
    model = config['model']
    
    qs = model.objects.filter(status='published')
    if hasattr(model, 'is_active'):
        qs = qs.filter(is_active=True)
    
    obj = get_object_or_404(qs.select_related('category', 'author'), slug=slug)
    
    # Atomic view increment
    model.objects.filter(pk=obj.pk).update(views=F('views') + 1)
    obj.views += 1
    
    # Comments
    comments = Comment.objects.filter(
        content_type=content_type,
        object_id=obj.id,
        is_approved=True,
        parent=None
    ).select_related('user').prefetch_related('replies__user')[:25]
    
    # Related items
    related = model.objects.filter(
        category=obj.category,
        status='published'
    ).exclude(id=obj.id)
    if hasattr(model, 'is_active'):
        related = related.filter(is_active=True)
    related = related.defer(*config['defer_fields'])[:3]
    
    # User state
    user_state = {}
    if request.user.is_authenticated:
        user_state = {
            'has_liked': obj.likes.filter(id=request.user.id).exists(),
            'has_bookmarked': obj.bookmarks.filter(id=request.user.id).exists(),
        }
    
    # Navigation - FIXED: Handle None dates
    date_field = config['date_field']
    date_value = getattr(obj, date_field)
    
    prev_obj = None
    next_obj = None
    
    if date_value is not None:
        prev_obj = model.objects.filter(
            **{f'{date_field}__lt': date_value},
            status='published'
        ).order_by(f'-{date_field}').first()
        
        next_obj = model.objects.filter(
            **{f'{date_field}__gt': date_value},
            status='published'
        ).order_by(date_field).first()
    else:
        prev_obj = model.objects.filter(
            id__lt=obj.id,
            status='published'
        ).order_by('-id').first()
        next_obj = model.objects.filter(
            id__gt=obj.id,
            status='published'
        ).order_by('id').first()
    
    # FIXED: Safe image handling
    og_image = None
    if obj.featured_image:
        try:
            og_image = obj.featured_image.url
        except ValueError:
            og_image = None
    
    context = {
        'object': obj,
        'post': obj,  # Template compatibility
        'content_type': content_type,
        'comments': comments,
        'total_comments': Comment.objects.filter(
            content_type=content_type, object_id=obj.id, is_approved=True
        ).count(),
        'related_items': related,
        'related_posts': related,
        'prev_item': prev_obj,
        'next_item': next_obj,
        'prev_post': prev_obj,
        'next_post': next_obj,
        'prev_object': prev_obj,
        'next_object': next_obj,
        **user_state,
        'ads': get_cached_ads() if content_type != 'quiz' else None,
        'trending_topics': get_trending_topics(),
        'page_title': obj.meta_title or obj.title,
        'meta_description': obj.meta_description or strip_tags(obj.excerpt)[:160],
        'canonical_url': request.build_absolute_uri(obj.get_absolute_url()),
        'og_image': og_image,
        'structured_data': build_article_schema(request, obj, content_type),
    }
    
    template = 'website/dynamic/content_detail.html'
    if content_type == 'post' and getattr(obj, 'template_name', None):
        custom_template = f'website/{obj.template_name}'
        allowed_templates = [
            'website/dynamic/post_detail_notes.html',
            'website/dynamic/post_detail_guide.html',
            'website/dynamic/post_detail_formula.html',
            'website/dynamic/post_detail_paper.html',
            'website/dynamic/post_detail_video.html',
        ]
        if custom_template in allowed_templates:
            template = custom_template
    
    return render(request, template, context)

# Add to views.py for AdSense compliance
def privacy_view(request):
    return render(request, 'website/static_pages/privacy_policy.html')

def terms_view(request):
    return render(request, 'website/static_pages/terms_of_service.html')
def build_article_schema(request, obj, content_type):
    """Article schema with safe date and image handling"""
    pub_date = getattr(obj, 'published_at', None) or getattr(obj, 'created_at', None)
    mod_date = getattr(obj, 'updated_at', None) or pub_date
    
    image_url = None
    if obj.featured_image:
        try:
            image_url = request.build_absolute_uri(obj.featured_image.url)
        except ValueError:
            image_url = None
    
    schema = {
        '@context': 'https://schema.org',
        '@type': 'Article',
        'headline': obj.title,
        'description': obj.meta_description or strip_tags(obj.excerpt)[:160],
        'url': request.build_absolute_uri(obj.get_absolute_url()),
        'datePublished': pub_date.isoformat() if pub_date else None,
        'dateModified': mod_date.isoformat() if mod_date else None,
        'author': {
            '@type': 'Person',
            'name': getattr(obj.author, 'user', {}).get_full_name() if obj.author else 'TayariWeb Team',
        },
        'publisher': {
            '@type': 'Organization',
            'name': 'TayariWeb',
            'logo': {
                '@type': 'ImageObject',
                'url': request.build_absolute_uri('/static/images/logo.png'),
            },
        },
    }
    
    schema = {k: v for k, v in schema.items() if v is not None}
    
    if image_url:
        schema['image'] = image_url
    
    return schema


# ==================== API ENDPOINTS ====================
@require_POST
def add_comment_view(request, content_type, object_id):
    """Unified comment endpoint - supports both registered users and guests"""
    
    # Get data from POST (matches quiz format)
    guest_name = request.POST.get('guest_name', '').strip()
    text = request.POST.get('text', '').strip() or request.POST.get('content', '').strip()
    
    # Validation
    if len(text) < 3:
        return JsonResponse({'error': 'Comment too short (min 3 chars)'}, status=400)
    if len(text) > 2000:
        return JsonResponse({'error': 'Comment too long (max 2000 chars)'}, status=400)
    
    # Guest name validation for non-authenticated users
    if not request.user.is_authenticated:
        if not guest_name:
            return JsonResponse({'error': 'Please enter your name'}, status=400)
        if len(guest_name) > 50:
            return JsonResponse({'error': 'Name too long (max 50 chars)'}, status=400)
    
    # Validate content type
    if content_type not in CONTENT_METADATA:
        return JsonResponse({'error': 'Invalid content type'}, status=400)
    
    # Get the content object
    model = CONTENT_METADATA[content_type]['model']
    try:
        obj = model.objects.get(id=object_id, status='published')
        if getattr(obj, 'is_active', True) is False:
            raise model.DoesNotExist
    except model.DoesNotExist:
        return JsonResponse({'error': 'Content not found'}, status=404)
    
    # Create comment (matches quiz logic)
    comment_data = {
        'content_type': content_type,
        'object_id': object_id,
        'content': text[:2000],
        'is_approved': True,  # Auto-approve for now
    }
    
    # Handle user or guest
    if request.user.is_authenticated:
        comment_data['user'] = request.user
    else:
        comment_data['guest_name'] = guest_name[:50]
    
    # Handle parent (reply)
    parent_id = request.POST.get('parent_id')
    if parent_id and parent_id.isdigit():
        comment_data['parent_id'] = int(parent_id)
    
    comment = Comment.objects.create(**comment_data)
    
    # Return response matching quiz format
    response_data = {
        'status': 'success',
        'comment_id': comment.id,
        'user': comment.user.username if comment.user else comment.guest_name,
        'text': comment.content,
        'created_at': comment.created_at.strftime('%b %d, %Y %H:%M'),
        'is_guest': comment.user is None,
    }
    
    return JsonResponse(response_data)

def load_comments_api(request, content_type, object_id):
    """API to load comments for a content object (matches quiz pattern)"""
    
    if content_type not in CONTENT_METADATA:
        return JsonResponse({'error': 'Invalid content type'}, status=400)
    
    comments = Comment.objects.filter(
        content_type=content_type,
        object_id=object_id,
        is_approved=True,
        parent=None
    ).select_related('user').prefetch_related('likes')[:50]
    
    data = []
    for c in comments:
        data.append({
            'comment_id': c.id,
            'user': c.user.username if c.user else None,
            'guest_name': c.guest_name,
            'text': c.content,
            'created_at': c.created_at.strftime('%b %d, %Y %H:%M'),
            'likes': c.likes.count(),
            'is_guest': c.user is None,
        })
    
    return JsonResponse({'comments': data})


@login_required
@require_POST
def toggle_interaction_view(request, interaction, content_type, pk):
    """Unified like/bookmark endpoint"""
    if interaction not in ['like', 'bookmark']:
        return JsonResponse({'error': 'Invalid action'}, status=400)
    
    if content_type not in CONTENT_METADATA:
        return JsonResponse({'error': 'Invalid content type'}, status=400)
    
    model = CONTENT_METADATA[content_type]['model']
    obj = get_object_or_404(model, pk=pk)
    
    field = getattr(obj, 'likes' if interaction == 'like' else 'bookmarks')
    
    if field.filter(id=request.user.id).exists():
        field.remove(request.user)
        active = False
    else:
        field.add(request.user)
        active = True
    
    response = {'status': active}
    if interaction == 'like':
        response['total_likes'] = obj.likes.count()
    
    return JsonResponse(response)


@require_POST
def newsletter_subscribe_view(request):
    """Newsletter subscription"""
    email = request.POST.get('email', '').strip().lower()
    
    if not email or '@' not in email:
        return JsonResponse({'error': 'Valid email required'}, status=400)
    
    existing = NewsletterSubscriber.objects.filter(email=email).first()
    if existing:
        if existing.is_active:
            return JsonResponse({'message': 'Already subscribed'}, status=200)
        existing.is_active = True
        existing.save()
        return JsonResponse({'success': True, 'message': 'Welcome back!'})
    
    NewsletterSubscriber.objects.create(email=email, is_active=True)
    return JsonResponse({'success': True, 'message': 'Subscribed successfully'})


# ==================== SEARCH & STATIC VIEWS ====================
def search_view(request):
    """Global search"""
    query = request.GET.get('q', '').strip()
    
    if not query or len(query) < 2:
        return render(request, 'website/dynamic/search.html', {
            'query': '',
            'results': [],
            'suggested_searches': ['CSS preparation', 'PMS 2024', 'ISSB tests', 'HEC scholarships']
        })
    
    results = []
    
    for key, config in CONTENT_METADATA.items():
        model = config['model']
        qs = model.objects.filter(status='published')
        if hasattr(model, 'is_active'):
            qs = qs.filter(is_active=True)
        
        search_q = Q(title__icontains=query) | Q(excerpt__icontains=query)
        if key == 'job':
            search_q |= Q(organization__icontains=query)
        elif key == 'scholarship':
            search_q |= Q(provider__icontains=query) | Q(country__icontains=query)
        elif key == 'course':
            search_q |= Q(platform__icontains=query)
        
        items = qs.filter(search_q).select_related('category')[:5]
        
        for item in items:
            score = 0
            if query.lower() in item.title.lower():
                score += 100
            
            results.append({
                'object': item,
                'type': key,
                'type_label': config['title'],
                'url': item.get_absolute_url(),
                'relevance_score': score,
            })
    
    results.sort(key=lambda x: (-x['relevance_score'], x['object'].title))
    
    return render(request, 'website/dynamic/search.html', {
        'query': query,
        'results': results[:20],
        'total_results': len(results),
    })


def live_search_api(request):
    """AJAX search endpoint"""
    query = request.GET.get('q', '').strip()
    limit = min(int(request.GET.get('limit', 5)), 10)
    
    if not query or len(query) < 2:
        return JsonResponse({'results': []})
    
    results = []
    
    for key, config in CONTENT_METADATA.items():
        model = config['model']
        qs = model.objects.filter(
            Q(title__icontains=query) | Q(excerpt__icontains=query),
            status='published'
        )
        if hasattr(model, 'is_active'):
            qs = qs.filter(is_active=True)
        
        items = qs.values('id', 'title', 'slug', 'excerpt')[:limit]
        
        for item in items:
            results.append({
                'id': item['id'],
                'title': item['title'],
                'excerpt': (item['excerpt'] or '')[:80] + '...',
                'type': key,
                'url': f"/{key}/{item['slug']}/",
            })
    
    results.sort(key=lambda x: (not query.lower() in x['title'].lower(), x['title']))
    
    return JsonResponse({'results': results[:limit]})


def about_view(request):
    """About page"""
    return render(request, 'website/static_pages/about.html', {
        'page_title': 'About TayariWeb - Pakistan\'s Premier Education Portal',
        'meta_description': 'TayariWeb provides free study materials, job alerts, scholarships, and courses for Pakistani students.',
    })


def contact_view(request):
    """Contact page"""
    return render(request, 'website/static_pages/contact.html', {
        'page_title': 'Contact Us - TayariWeb',
        'meta_description': 'Get in touch with TayariWeb team for partnerships, content submissions, or support.',
    })


def author_profile_view(request, username):
    """Author profile"""
    author = get_object_or_404(Author, user__username=username)
    
    all_content = []
    for key, config in CONTENT_METADATA.items():
        items = config['model'].objects.filter(
            author=author,
            status='published'
        ).defer(*config['defer_fields']).order_by('-published_at')[:4]
        all_content.extend([(item, key) for item in items])
    
    all_content.sort(key=lambda x: x[0].published_at, reverse=True)
    
    return render(request, 'website/author_profile.html', {
        'author': author,
        'recent_content': all_content[:12],
        'page_title': f"{author.user.get_full_name() or author.user.username} - Author Profile",
    })


def category_detail_view(request, slug):
    """Category hub page - FIXED: Explicit queries for all types"""
    category = get_object_or_404(Category, slug=slug, is_active=True)
    
    posts = Post.objects.filter(
        category=category, status='published'
    ).defer('content', 'table_of_contents').order_by('-published_at')[:6]
    
    jobs = Job.objects.filter(
        category=category, is_active=True, status='published'
    ).defer('content', 'eligibility_criteria', 'requirements', 'benefits', 'how_to_apply').order_by('-published_at')[:6]
    
    scholarships = Scholarship.objects.filter(
        category=category, is_active=True, status='published'
    ).defer('content', 'eligibility_criteria', 'benefits_details', 'required_documents', 'selection_process').order_by('-published_at')[:6]
    
    courses = Course.objects.filter(
        category=category, is_active=True, status='published'
    ).defer('content', 'syllabus_overview', 'prerequisites', 'skills_gained').order_by('-published_at')[:6]
    
    total_items = len(posts) + len(jobs) + len(scholarships) + len(courses)
    
    return render(request, 'website/category_detail.html', {
        'category': category,
        'posts': posts,
        'jobs': jobs,
        'scholarships': scholarships,
        'courses': courses,
        'total_items': total_items,
        'ads': get_cached_ads(),
        'page_title': f"{category.name} - Study Materials, Jobs & Scholarships",
        'meta_description': category.description or f"Explore {category.name} resources on TayariWeb",
    })