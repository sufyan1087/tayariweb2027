from django.contrib import admin
from django_ckeditor_5.widgets import CKEditor5Widget
from django import forms
from django.utils.safestring import mark_safe
from django.template.response import TemplateResponse  # ADD THIS IMPORT

from .models import (
    Category, Tag, Author, Post, Comment,
    SidebarLink, AdSection, TrendingTopic, NewsletterSubscriber,
    Job, Scholarship, Course
)


# ================== INLINE CSS FIX ==================
CKEDITOR_WIDTH_FIX = '''
<style type="text/css">
    /* FORCE CKEditor 5 to be narrow */
    .django-ckeditor-widget,
    div.django-ckeditor-widget,
    form .django-ckeditor-widget,
    .form-row .django-ckeditor-widget {
        display: block !important;
        width: 100% !important;
        max-width: 750px !important;
        min-width: auto !important;
        box-sizing: border-box !important;
    }
    
    .ck.ck-editor,
    div.ck-editor {
        max-width: 750px !important;
        width: 100% !important;
    }
    
    .ck-editor__editable,
    .ck.ck-editor__editable_inline {
        max-width: 750px !important;
        width: 100% !important;
    }
    
    /* TOOLBAR FIX - Allow wrap but look good */
    .ck.ck-toolbar {
        max-width: 750px !important;
        width: 100% !important;
        flex-wrap: wrap !important;
        padding: 5px !important;
        gap: 2px !important;
    }
    
    /* Toolbar items styling */
    .ck.ck-toolbar .ck-toolbar__items {
        flex-wrap: wrap !important;
        gap: 2px !important;
    }
    
    .ck.ck-toolbar .ck-button {
        padding: 4px 8px !important;
        min-width: 30px !important;
        min-height: 30px !important;
    }
    
    /* Separator styling */
    .ck.ck-toolbar .ck-toolbar__separator {
        margin: 5px 2px !important;
    }
    
    /* Dropdowns */
    .ck.ck-toolbar .ck-dropdown {
        margin: 2px !important;
    }
    
    /* Django admin field alignment */
    .form-row .django-ckeditor-widget {
        margin-left: 160px !important;
        display: block !important;
    }
    
    /* Collapsed fieldsets */
    fieldset.collapsed .django-ckeditor-widget,
    fieldset.collapse .django-ckeditor-widget {
        margin-left: 0 !important;
    }
    
    /* Mobile */
    @media (max-width: 767px) {
        .form-row .django-ckeditor-widget {
            margin-left: 0 !important;
        }
    }
</style>
'''

# ================== CKEditor Form Mixins ==================
class BaseContentAdminForm(forms.ModelForm):
    class Meta:
        widgets = {
            'content': CKEditor5Widget(config_name='full'),
            'excerpt': forms.Textarea(attrs={'rows': 3, 'style': 'width: 95%; max-width: 750px;'}),
        }

class JobAdminForm(forms.ModelForm):
    class Meta:
        widgets = {
            'content': CKEditor5Widget(config_name='full'),
            'eligibility_criteria': CKEditor5Widget(config_name='default'),
            'requirements': CKEditor5Widget(config_name='default'),
            'benefits': CKEditor5Widget(config_name='default'),
            'how_to_apply': CKEditor5Widget(config_name='default'),
        }

class ScholarshipAdminForm(forms.ModelForm):
    class Meta:
        widgets = {
            'content': CKEditor5Widget(config_name='full'),
            'eligibility_criteria': CKEditor5Widget(config_name='default'),
            'benefits_details': CKEditor5Widget(config_name='default'),
            'required_documents': CKEditor5Widget(config_name='default'),
            'selection_process': CKEditor5Widget(config_name='default'),
        }

class CourseAdminForm(forms.ModelForm):
    class Meta:
        widgets = {
            'content': CKEditor5Widget(config_name='full'),
            'syllabus_overview': CKEditor5Widget(config_name='default'),
            'prerequisites': CKEditor5Widget(config_name='default'),
            'skills_gained': CKEditor5Widget(config_name='default'),
        }


# ================== BASE CONTENT ADMIN ==================
class BaseContentAdmin(admin.ModelAdmin):
    list_display = ['title', 'category', 'author', 'status', 'is_featured', 'views', 'published_at']
    list_filter = ['status', 'is_featured', 'category', 'published_at']
    list_editable = ['status', 'is_featured']
    search_fields = ['title', 'content', 'excerpt', 'meta_title']
    prepopulated_fields = {'slug': ('title',)}
    date_hierarchy = 'published_at'
    filter_horizontal = ['tags', 'likes', 'bookmarks']
    
    fieldsets = (
        ('Basic Information', {
            'fields': ('title', 'slug', 'excerpt', 'content', 'featured_image', 'image_caption')
        }),
        ('Relationships', {
            'fields': ('category', 'tags', 'author')
        }),
        ('Status & Visibility', {
            'fields': ('status', 'is_featured', 'is_trending', 'published_at')
        }),
        ('SEO & Metadata', {
            'fields': ('meta_title', 'meta_description', 'keywords'),
            'classes': ('collapse',)
        }),
        ('Downloads', {
            'fields': ('pdf_file', 'pdf_size', 'ppt_file', 'ppt_size'),
            'classes': ('collapse',)
        }),
        ('Advanced', {
            'fields': ('table_of_contents',),
            'classes': ('collapse',)
        }),
    )
    
    def get_queryset(self, request):
        return super().get_queryset(request).select_related('category', 'author')
    
    # INJECT CSS DIRECTLY INTO ADMIN FORM
    def render_change_form(self, request, context, add=False, change=False, form_url='', obj=None):
        response = super().render_change_form(request, context, add, change, form_url, obj)
        
        # Inject CSS before </head>
        if isinstance(response, TemplateResponse):
            response.render()
        
        css_bytes = CKEDITOR_WIDTH_FIX.encode('utf-8')
        response.content = response.content.replace(b'</head>', css_bytes + b'</head>')
        return response


# ================== POST ADMIN ==================
@admin.register(Post)
class PostAdmin(BaseContentAdmin):
    form = BaseContentAdminForm
    list_display = ['title', 'category', 'author', 'post_type', 'status', 'is_featured', 'views', 'published_at']
    list_filter = ['status', 'post_type', 'category', 'is_featured', 'is_trending', 'created_at']
    
    fieldsets = BaseContentAdmin.fieldsets + (
        ('Post Specific', {
            'fields': ('post_type', 'template_name', 'read_time', 'downloads')
        }),
    )


# ================== JOB ADMIN ==================
@admin.register(Job)
class JobAdmin(BaseContentAdmin):
    form = JobAdminForm
    list_display = ['title', 'category', 'organization', 'location', 'deadline', 'is_active', 'is_featured', 'views']
    list_filter = ['status', 'is_active', 'is_featured', 'job_type', 'category', 'deadline']
    list_editable = ['is_active', 'is_featured']
    
    fieldsets = BaseContentAdmin.fieldsets + (
        ('Job Details', {
            'fields': ('job_type', 'organization', 'location', 'salary_range', 'deadline', 'application_link', 'is_active')
        }),
        ('Structured Content', {
            'fields': ('eligibility_criteria', 'requirements', 'benefits', 'how_to_apply'),
            'classes': ('collapse',),
            'description': 'Rich text fields for structured content sections'
        }),
    )


# ================== SCHOLARSHIP ADMIN ==================
@admin.register(Scholarship)
class ScholarshipAdmin(BaseContentAdmin):
    form = ScholarshipAdminForm
    list_display = ['title', 'category', 'provider', 'country', 'study_level', 'deadline', 'is_active', 'is_featured']
    list_filter = ['status', 'is_active', 'is_featured', 'study_level', 'coverage_type', 'category', 'deadline']
    list_editable = ['is_active', 'is_featured']
    
    fieldsets = BaseContentAdmin.fieldsets + (
        ('Scholarship Details', {
            'fields': ('study_level', 'provider', 'country', 'coverage_type', 'deadline', 'application_link', 'is_active')
        }),
        ('Structured Content', {
            'fields': ('eligibility_criteria', 'benefits_details', 'required_documents', 'selection_process'),
            'classes': ('collapse',)
        }),
    )


# ================== COURSE ADMIN ==================
@admin.register(Course)
class CourseAdmin(BaseContentAdmin):
    form = CourseAdminForm
    list_display = ['title', 'category', 'platform', 'instructor', 'level', 'rating', 'students_enrolled', 'is_active']
    list_filter = ['status', 'is_active', 'is_featured', 'level', 'has_certificate', 'is_free', 'category']
    list_editable = ['is_active']
    
    fieldsets = BaseContentAdmin.fieldsets + (
        ('Course Details', {
            'fields': ('platform', 'instructor', 'duration', 'level', 'has_certificate', 'is_free', 
                      'original_price', 'course_link', 'students_enrolled', 'rating', 'is_active')
        }),
        ('Structured Content', {
            'fields': ('syllabus_overview', 'prerequisites', 'skills_gained'),
            'classes': ('collapse',)
        }),
    )


# ================== CATEGORY ADMIN ==================
@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ['name', 'icon', 'order', 'is_active', 'total_items']
    list_editable = ['order', 'is_active']
    prepopulated_fields = {'slug': ('name',)}
    search_fields = ['name', 'description']
    
    # Add CSS injection
    def render_change_form(self, request, context, add=False, change=False, form_url='', obj=None):
        response = super().render_change_form(request, context, add, change, form_url, obj)
        if isinstance(response, TemplateResponse):
            response.render()
        css_bytes = CKEDITOR_WIDTH_FIX.encode('utf-8')
        response.content = response.content.replace(b'</head>', css_bytes + b'</head>')
        return response

    def total_items(self, obj):
        total = (obj.post_items.filter(status='published').count() +
                obj.job_items.filter(status='published', is_active=True).count() +
                obj.scholarship_items.filter(status='published', is_active=True).count() +
                obj.course_items.filter(status='published', is_active=True).count())
        return total
    total_items.short_description = 'Total Items'


# ================== OTHER ADMINS ==================
@admin.register(Tag)
class TagAdmin(admin.ModelAdmin):
    list_display = ['name', 'slug']
    prepopulated_fields = {'slug': ('name',)}
    search_fields = ['name']


@admin.register(Author)
class AuthorAdmin(admin.ModelAdmin):
    list_display = ['user', 'title', 'total_articles', 'total_students', 'rating']
    search_fields = ['user__username', 'user__first_name', 'user__last_name', 'bio']
    filter_horizontal = ['followers']
    
    def render_change_form(self, request, context, add=False, change=False, form_url='', obj=None):
        response = super().render_change_form(request, context, add, change, form_url, obj)
        if isinstance(response, TemplateResponse):
            response.render()
        css_bytes = CKEDITOR_WIDTH_FIX.encode('utf-8')
        response.content = response.content.replace(b'</head>', css_bytes + b'</head>')
        return response


@admin.register(Comment)
class CommentAdmin(admin.ModelAdmin):
    list_display = ['content_type', 'object_id', 'user', 'is_approved', 'created_at', 'total_likes']
    list_filter = ['content_type', 'is_approved', 'created_at']
    search_fields = ['content', 'user__username']
    list_select_related = ['user']
    actions = ['approve_comments', 'disapprove_comments']
    
    def render_change_form(self, request, context, add=False, change=False, form_url='', obj=None):
        response = super().render_change_form(request, context, add, change, form_url, obj)
        if isinstance(response, TemplateResponse):
            response.render()
        css_bytes = CKEDITOR_WIDTH_FIX.encode('utf-8')
        response.content = response.content.replace(b'</head>', css_bytes + b'</head>')
        return response

    @admin.action(description='Approve selected comments')
    def approve_comments(self, request, queryset):
        queryset.update(is_approved=True)

    @admin.action(description='Disapprove selected comments')
    def disapprove_comments(self, request, queryset):
        queryset.update(is_approved=False)


@admin.register(SidebarLink)
class SidebarLinkAdmin(admin.ModelAdmin):
    list_display = ['title', 'position', 'order', 'is_active']
    list_editable = ['order', 'is_active']
    list_filter = ['position']


@admin.register(AdSection)
class AdSectionAdmin(admin.ModelAdmin):
    list_display = ['title', 'position', 'is_active', 'impressions', 'clicks']
    list_filter = ['position', 'is_active']
    list_editable = ['is_active']
    
    def render_change_form(self, request, context, add=False, change=False, form_url='', obj=None):
        response = super().render_change_form(request, context, add, change, form_url, obj)
        if isinstance(response, TemplateResponse):
            response.render()
        css_bytes = CKEDITOR_WIDTH_FIX.encode('utf-8')
        response.content = response.content.replace(b'</head>', css_bytes + b'</head>')
        return response


@admin.register(TrendingTopic)
class TrendingTopicAdmin(admin.ModelAdmin):
    list_display = ['title', 'rank', 'views', 'is_active']
    list_editable = ['rank', 'is_active']


@admin.register(NewsletterSubscriber)
class NewsletterSubscriberAdmin(admin.ModelAdmin):
    list_display = ['email', 'name', 'is_active', 'subscribed_at']
    list_filter = ['is_active', 'subscribed_at']
    search_fields = ['email', 'name']