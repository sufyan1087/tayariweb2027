from django.db import models
from django.contrib.auth.models import User
from django.utils.text import slugify
from django.utils import timezone
from django.core.exceptions import ValidationError
from django_ckeditor_5.fields import CKEditor5Field


# ================== SLUG VALIDATION ==================
def validate_unique_slug_across_models(slug, exclude_model=None, exclude_instance_id=None):
    """Check if slug exists in any content model"""
    models_to_check = []
    if exclude_model != 'post':
        models_to_check.append(('post', Post))
    if exclude_model != 'job':
        models_to_check.append(('job', Job))
    if exclude_model != 'scholarship':
        models_to_check.append(('scholarship', Scholarship))
    if exclude_model != 'course':
        models_to_check.append(('course', Course))
    
    for name, model_class in models_to_check:
        try:
            existing = model_class.objects.filter(slug=slug)
            if exclude_instance_id:
                existing = existing.exclude(id=exclude_instance_id)
            if existing.exists():
                return False, name
        except:
            continue
    return True, None


# ================== CATEGORY ==================
class Category(models.Model):
    name = models.CharField(max_length=100, unique=True)
    slug = models.SlugField(max_length=100, unique=True, blank=True)
    description = CKEditor5Field('Description', blank=True, config_name='default')
    icon = models.CharField(max_length=10, default='📚')
    color = models.CharField(max_length=7, default='#563d7c')
    order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name_plural = 'Categories'
        ordering = ['order', 'name']

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(self.name)
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name

    def get_absolute_url(self):
        from django.urls import reverse
        return reverse('website:category_detail', kwargs={'slug': self.slug})


# ================== TAG ==================
class Tag(models.Model):
    name = models.CharField(max_length=50, unique=True)
    slug = models.SlugField(max_length=50, unique=True, blank=True)

    class Meta:
        ordering = ['name']

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(self.name)
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name


# ================== AUTHOR ==================
class Author(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='author_profile')
    avatar = models.ImageField(upload_to='authors/', blank=True, null=True)
    bio = CKEditor5Field('Biography', blank=True, config_name='default')
    title = models.CharField(max_length=200, blank=True)
    website = models.URLField(blank=True)
    twitter = models.URLField(blank=True)
    linkedin = models.URLField(blank=True)
    followers = models.ManyToManyField(User, related_name='following', blank=True)
    total_articles = models.PositiveIntegerField(default=0)
    total_students = models.PositiveIntegerField(default=0)
    rating = models.DecimalField(max_digits=2, decimal_places=1, default=5.0)

    def __str__(self):
        return self.user.get_full_name() or self.user.username

    def get_absolute_url(self):
        from django.urls import reverse
        return reverse('website:author_profile', kwargs={'username': self.user.username})


# ================== BASE CONTENT MODEL (Abstract) ==================
class BaseContent(models.Model):
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('published', 'Published'),
        ('archived', 'Archived'),
    ]
    
    title = models.CharField(max_length=300)
    slug = models.SlugField(max_length=300, unique=True, blank=True)
    excerpt = models.TextField(max_length=500, help_text='Short description for cards and SEO', blank=True)
    content = CKEditor5Field('Content', config_name='full')
    
    featured_image = models.ImageField(upload_to='posts/%Y/%m/', blank=True, null=True)
    image_caption = models.CharField(max_length=200, blank=True)
    
    category = models.ForeignKey(Category, on_delete=models.SET_NULL, null=True, related_name='%(class)s_items')
    tags = models.ManyToManyField(Tag, blank=True, related_name='%(class)s_items')
    author = models.ForeignKey(Author, on_delete=models.SET_NULL, null=True, related_name='%(class)s_items')
    
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='draft')
    is_featured = models.BooleanField(default=False)
    is_trending = models.BooleanField(default=False)
    
    views = models.PositiveIntegerField(default=0)
    likes = models.ManyToManyField(User, related_name='liked_%(class)s', blank=True)
    bookmarks = models.ManyToManyField(User, related_name='bookmarked_%(class)s', blank=True)
    
    meta_title = models.CharField(max_length=70, blank=True)
    meta_description = models.CharField(max_length=160, blank=True)
    keywords = models.CharField(max_length=300, blank=True, help_text='Comma separated keywords')
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    published_at = models.DateTimeField(blank=True, null=True, default=timezone.now)
    
    # Downloads
    pdf_file = models.FileField(upload_to='downloads/pdfs/', blank=True, null=True)
    pdf_size = models.CharField(max_length=20, blank=True)
    ppt_file = models.FileField(upload_to='downloads/ppts/', blank=True, null=True)
    ppt_size = models.CharField(max_length=20, blank=True)
    
    # Table of contents for structured content
    table_of_contents = models.JSONField(default=dict, blank=True)
    
    class Meta:
        abstract = True
        ordering = ['-published_at', '-created_at']
    
    def clean(self):
        super().clean()
        # Generate slug if not present
        if not self.slug:
            self.slug = slugify(self.title)
        
        # Check uniqueness across all models
        model_name = self._meta.model_name
        is_unique, conflict_model = validate_unique_slug_across_models(
            self.slug, 
            exclude_model=model_name,
            exclude_instance_id=self.id
        )
        if not is_unique:
            raise ValidationError(f'Slug already exists in {conflict_model}. Please use a unique title.')
    
    def save(self, *args, **kwargs):
        self.full_clean()
        
        # Auto-generate excerpt from content (strip HTML tags)
        if not self.excerpt:
            import re
            # Strip HTML tags for excerpt
            clean_content = re.sub(r'<[^>]+>', '', self.content)
            self.excerpt = (clean_content[:200] + '...') if len(clean_content) > 200 else clean_content
            
        if not self.meta_title:
            self.meta_title = self.title[:70]
        if not self.meta_description:
            self.meta_description = self.excerpt[:160]
        super().save(*args, **kwargs)
    
    @property
    def total_likes(self):
        return self.likes.count()
    
    def __str__(self):
        return self.title


# ================== POST ==================
class Post(BaseContent):
    POST_TYPE_CHOICES = [
        ('article', 'Article'),
        ('notes', 'Study Notes'),
        ('guide', 'Complete Guide'),
        ('formula', 'Formula Sheet'),
        ('previous_paper', 'Previous Year Paper'),
        ('video', 'Video Lecture'),
    ]
    
    TEMPLATE_CHOICES = [
        ('', 'Default'),
        ('post_detail_notes.html', 'Notes Template'),
        ('post_detail_guide.html', 'Guide Template'),
        ('post_detail_formula.html', 'Formula Sheet Template'),
        ('post_detail_paper.html', 'Previous Paper Template'),
        ('post_detail_video.html', 'Video Lecture Template'),
    ]
    
    post_type = models.CharField(max_length=20, choices=POST_TYPE_CHOICES, default='article')
    template_name = models.CharField(
        max_length=50, 
        choices=TEMPLATE_CHOICES, 
        blank=True, 
        default='',
        help_text='Select a custom template, or leave blank for default'
    )
    read_time = models.PositiveIntegerField(default=5, help_text='Estimated reading time in minutes')
    downloads = models.PositiveIntegerField(default=0)
    
    class Meta:
        ordering = ['-published_at', '-created_at']
    
    def get_absolute_url(self):
        from django.urls import reverse
        return reverse('website:post_detail', kwargs={'slug': self.slug})


# ================== JOB ==================
class Job(BaseContent):
    JOB_TYPE_CHOICES = [
        ('full_time', 'Full Time'),
        ('part_time', 'Part Time'),
        ('contract', 'Contract'),
        ('internship', 'Internship'),
    ]
    
    job_type = models.CharField(max_length=20, choices=JOB_TYPE_CHOICES, default='full_time')
    organization = models.CharField(max_length=200, blank=True)
    location = models.CharField(max_length=200, blank=True)
    salary_range = models.CharField(max_length=100, blank=True)
    deadline = models.DateField(blank=True, null=True)
    application_link = models.URLField(blank=True)
    
    # Structured sections - Now using CKEditor
    eligibility_criteria = CKEditor5Field('Eligibility Criteria', blank=True, config_name='default', help_text='Who can apply')
    requirements = CKEditor5Field('Requirements', blank=True, config_name='default', help_text='Skills, experience required')
    benefits = CKEditor5Field('Benefits', blank=True, config_name='default', help_text='Perks, benefits')
    how_to_apply = CKEditor5Field('How to Apply', blank=True, config_name='default', help_text='Application process')
    
    is_active = models.BooleanField(default=True)
    
    class Meta:
        ordering = ['-published_at']
        verbose_name_plural = 'Jobs'
    
    def get_absolute_url(self):
        from django.urls import reverse
        return reverse('website:job_detail', kwargs={'slug': self.slug})
    
    @property
    def is_expiring_soon(self):
        if self.deadline:
            from datetime import date, timedelta
            return self.deadline <= date.today() + timedelta(days=7)
        return False
    
    @property
    def is_expired(self):
        if self.deadline:
            from datetime import date
            return self.deadline < date.today()
        return False


# ================== SCHOLARSHIP ==================
class Scholarship(BaseContent):
    STUDY_LEVEL_CHOICES = [
        ('undergraduate', 'Undergraduate'),
        ('masters', 'Masters'),
        ('phd', 'PhD'),
        ('postdoc', 'Post Doctoral'),
    ]
    
    COVERAGE_CHOICES = [
        ('full', 'Full Scholarship'),
        ('partial', 'Partial Scholarship'),
        ('tuition_only', 'Tuition Only'),
        ('stipend_only', 'Stipend Only'),
    ]
    
    study_level = models.CharField(max_length=20, choices=STUDY_LEVEL_CHOICES, default='undergraduate')
    provider = models.CharField(max_length=200, blank=True)
    country = models.CharField(max_length=100, blank=True)
    coverage_type = models.CharField(max_length=20, choices=COVERAGE_CHOICES, default='full')
    deadline = models.DateField(blank=True, null=True)
    application_link = models.URLField(blank=True)
    
    # Structured sections - Now using CKEditor
    eligibility_criteria = CKEditor5Field('Eligibility Criteria', blank=True, config_name='default')
    benefits_details = CKEditor5Field('Benefits Details', blank=True, config_name='default', help_text='What does the scholarship cover')
    required_documents = CKEditor5Field('Required Documents', blank=True, config_name='default')
    selection_process = CKEditor5Field('Selection Process', blank=True, config_name='default')
    
    is_active = models.BooleanField(default=True)
    
    class Meta:
        ordering = ['-published_at']
        verbose_name_plural = 'Scholarships'
    
    def get_absolute_url(self):
        from django.urls import reverse
        return reverse('website:scholarship_detail', kwargs={'slug': self.slug})
    
    @property
    def is_expiring_soon(self):
        if self.deadline:
            from datetime import date, timedelta
            return self.deadline <= date.today() + timedelta(days=7)
        return False


# ================== COURSE ==================
class Course(BaseContent):
    LEVEL_CHOICES = [
        ('beginner', 'Beginner'),
        ('intermediate', 'Intermediate'),
        ('advanced', 'Advanced'),
        ('all_levels', 'All Levels'),
    ]
    
    platform = models.CharField(max_length=100, blank=True, help_text='Coursera, Udemy, edX, etc.')
    instructor = models.CharField(max_length=200, blank=True)
    duration = models.CharField(max_length=100, blank=True, help_text='e.g., 6 weeks, 40 hours')
    level = models.CharField(max_length=20, choices=LEVEL_CHOICES, default='beginner')
    has_certificate = models.BooleanField(default=False)
    is_free = models.BooleanField(default=True)
    original_price = models.CharField(max_length=50, blank=True, help_text='Original price if discounted')
    course_link = models.URLField(blank=True)
    students_enrolled = models.PositiveIntegerField(default=0)
    rating = models.DecimalField(max_digits=2, decimal_places=1, default=4.5)
    
    # Structured sections - Now using CKEditor
    syllabus_overview = CKEditor5Field('Syllabus Overview', blank=True, config_name='default')
    prerequisites = CKEditor5Field('Prerequisites', blank=True, config_name='default')
    skills_gained = CKEditor5Field('Skills Gained', blank=True, config_name='default')
    
    is_active = models.BooleanField(default=True)
    
    class Meta:
        ordering = ['-published_at']
        verbose_name_plural = 'Courses'
    
    def get_absolute_url(self):
        from django.urls import reverse
        return reverse('website:course_detail', kwargs={'slug': self.slug})


# ================== COMMENT ==================
class Comment(models.Model):
    CONTENT_TYPES = [
        ('post', 'Post'),
        ('job', 'Job'),
        ('scholarship', 'Scholarship'),
        ('course', 'Course'),
    ]
    
    content_type = models.CharField(max_length=20, choices=CONTENT_TYPES, default='post')
    object_id = models.PositiveIntegerField(default=1)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='comments')
    parent = models.ForeignKey('self', on_delete=models.CASCADE, null=True, blank=True, related_name='replies')
    content = CKEditor5Field('Comment', config_name='minimal')  # Minimal toolbar for comments
    
    # In models.py - Comment class
    guest_name = models.CharField(max_length=100, blank=True, null=True)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='comments', null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    is_approved = models.BooleanField(default=True)
    likes = models.ManyToManyField(User, related_name='liked_comments', blank=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'Comment by {self.user.username}'

    @property
    def total_likes(self):
        return self.likes.count()


# ================== SIDEBAR ==================
class SidebarLink(models.Model):
    SIDEBAR_POSITIONS = [
        ('left_1', 'Left Sidebar 1'),
        ('left_2', 'Left Sidebar 2'),
        ('right_1', 'Right Sidebar 1'),
        ('right_2', 'Right Sidebar 2'),
    ]

    title = models.CharField(max_length=100)
    url = models.URLField()
    position = models.CharField(max_length=10, choices=SIDEBAR_POSITIONS)
    order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    icon = models.CharField(max_length=10, blank=True)

    class Meta:
        ordering = ['position', 'order']

    def __str__(self):
        return f'{self.title} ({self.position})'


# ================== AD SECTION ==================
class AdSection(models.Model):
    AD_POSITIONS = [
        ('left_1', 'Left Ad 1'),
        ('left_2', 'Left Ad 2'),
        ('right_1', 'Right Ad 1'),
        ('right_2', 'Right Ad 2'),
        ('content_top', 'Content Top'),
        ('content_bottom', 'Content Bottom'),
        ('in_article', 'In Article'),
    ]

    title = models.CharField(max_length=200)
    position = models.CharField(max_length=20, choices=AD_POSITIONS)
    image = models.ImageField(upload_to='ads/', blank=True, null=True)
    content = CKEditor5Field('Ad Content', blank=True, config_name='default', help_text='HTML content for the ad')
    target_url = models.URLField(blank=True)
    is_active = models.BooleanField(default=True)
    start_date = models.DateTimeField(blank=True, null=True)
    end_date = models.DateTimeField(blank=True, null=True)
    impressions = models.PositiveIntegerField(default=0)
    clicks = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Advertisement'
        verbose_name_plural = 'Advertisements'
        ordering = ['position', '-created_at']

    def __str__(self):
        return self.title


# ================== TRENDING TOPICS ==================
class TrendingTopic(models.Model):
    title = models.CharField(max_length=200)
    url = models.URLField()
    views = models.PositiveIntegerField(default=0)
    rank = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['rank', '-views']

    def __str__(self):
        return self.title


# ================== NEWSLETTER ==================
class NewsletterSubscriber(models.Model):
    email = models.EmailField(unique=True)
    name = models.CharField(max_length=100, blank=True)
    is_active = models.BooleanField(default=True)
    subscribed_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.email