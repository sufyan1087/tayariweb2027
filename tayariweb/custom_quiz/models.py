# models.py - MULTIPLE CATEGORIES SUPPORT
from django.db import models
from django.urls import reverse
from ckeditor.fields import RichTextField
from ckeditor_uploader.fields import RichTextUploadingField


class QuizCategory(models.Model):
    name = models.CharField(max_length=100, unique=True)
    slug = models.SlugField(unique=True)
    description = RichTextField(blank=True)
    icon = models.CharField(max_length=50, blank=True)
    order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name_plural = "Quiz Categories"
        ordering = ['order', 'name']

    def __str__(self):
        return self.name
    
    def get_question_count(self):
        return Question.objects.filter(subcategory__category=self, is_active=True).count()

    def get_absolute_url(self):
        """FIXED: Use new URL name"""
        return reverse('custom_quiz:generator_by_slug', kwargs={'slug': self.slug})


class QuizSubCategory(models.Model):
    category = models.ForeignKey(
        QuizCategory, 
        on_delete=models.CASCADE, 
        related_name='subcategories'
    )
    name = models.CharField(max_length=100)
    slug = models.SlugField()
    description = RichTextField(blank=True)
    order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        verbose_name_plural = "Quiz Sub Categories"
        ordering = ['category__name', 'order', 'name']
        unique_together = ['category', 'slug']

    def __str__(self):
        return f"{self.category.name} → {self.name}"
    
    def get_question_stats(self):
        return {
            'total': self.questions.filter(is_active=True).count(),
            'easy': self.questions.filter(difficulty='easy', is_active=True).count(),
            'medium': self.questions.filter(difficulty='medium', is_active=True).count(),
            'hard': self.questions.filter(difficulty='hard', is_active=True).count(),
        }


class Question(models.Model):
    DIFFICULTY_CHOICES = [
        ('easy', 'Easy'),
        ('medium', 'Medium'),
        ('hard', 'Hard'),
    ]
    
    ANSWER_CHOICES = [(0, 'A'), (1, 'B'), (2, 'C'), (3, 'D')]
    
    subcategory = models.ForeignKey(
        QuizSubCategory, 
        on_delete=models.CASCADE, 
        related_name='questions'
    )
    question_text = RichTextField()
    option_a = models.CharField(max_length=255)
    option_b = models.CharField(max_length=255)
    option_c = models.CharField(max_length=255)
    option_d = models.CharField(max_length=255)
    correct_answer = models.PositiveSmallIntegerField(choices=ANSWER_CHOICES)
    explanation = RichTextUploadingField(blank=True)
    difficulty = models.CharField(max_length=10, choices=DIFFICULTY_CHOICES, default='medium')
    tags = models.CharField(max_length=255, blank=True, help_text="Comma-separated topics")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['subcategory__category__name', 'subcategory__name', '-created_at']
        verbose_name = "Quiz Question"
        verbose_name_plural = "Quiz Questions"

    def __str__(self):
        import re
        clean_text = re.sub('<[^<<]+?>', '', self.question_text)
        return f"[{self.subcategory.category.name} - {self.subcategory.name}] {clean_text[:60]}"
    
    def get_full_path(self):
        return f"{self.subcategory.category.name} > {self.subcategory.name}"

    def get_options(self):
        return [self.option_a, self.option_b, self.option_c, self.option_d]


class QuizPageContent(models.Model):
    """SEO Landing Pages for Categories"""
    page_key = models.CharField(
        max_length=50, 
        unique=True,
        help_text="Unique identifier: 'homepage', 'issb', 'pak-navy', etc."
    )
    
    # MULTIPLE CATEGORIES - Main new feature
    categories = models.ManyToManyField(
        QuizCategory,
        blank=True,
        related_name='pages',
        help_text="Select one or more categories for this page. Only subcategories of selected categories will be shown."
    )
    
    # SEO Fields
    meta_title = models.CharField(max_length=200, blank=True, help_text="Browser tab title")
    meta_description = models.TextField(blank=True, help_text="For Google search results")
    meta_keywords = models.CharField(max_length=500, blank=True, help_text="Comma-separated keywords")
    canonical_url = models.CharField(max_length=500, blank=True)
    
    # Content Fields
    heading = models.CharField(max_length=200, default='Custom Quiz Generator')
    subheading = RichTextField(default='Create personalized practice tests...')
    
    # Hero Section
    hero_title = RichTextField(blank=True, help_text="Main headline with formatting")
    hero_description = RichTextField(blank=True)
    hero_image = models.ImageField(upload_to='quiz_pages/', blank=True, null=True)
    
    # Features Section
    features_title = models.CharField(max_length=200, blank=True, default="Why Choose Us")
    features = models.JSONField(default=list, blank=True)
    
    # Main Content
    content_title = models.CharField(max_length=200, blank=True)
    main_content = RichTextUploadingField(blank=True)
    
    # FAQ Section
    faq_title = models.CharField(max_length=200, blank=True, default="Frequently Asked Questions")
    faqs = models.JSONField(default=list, blank=True)
    
    # Call to Action
    cta_title = models.CharField(max_length=200, blank=True, default="Start Practicing Now")
    cta_description = RichTextField(blank=True)
    cta_button_text = models.CharField(max_length=100, blank=True, default="Start Quiz")
    
    # Default Quiz Config
    default_question_count = models.PositiveIntegerField(default=20)
    default_time_limit = models.PositiveIntegerField(default=10)
    
    # Display Options
    show_hero = models.BooleanField(default=True)
    show_features = models.BooleanField(default=True)
    show_content = models.BooleanField(default=True)
    show_faq = models.BooleanField(default=True)
    show_stats = models.BooleanField(default=True)
    
    is_active = models.BooleanField(default=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['page_key']
        verbose_name = "Quiz Page Content"
        verbose_name_plural = "Quiz Page Contents"

    def __str__(self):
        cat_names = ", ".join([c.name for c in self.categories.all()]) if self.categories.exists() else "No categories"
        return f"{self.page_key} ({cat_names})"
    
    def get_absolute_url(self):
        """FIXED: Use new URL name 'generator' instead of 'custom_page'"""
        return reverse('custom_quiz:generator')
    
    def get_selected_categories_list(self):
        """Return list of selected category IDs"""
        return list(self.categories.values_list('id', flat=True))
    
    def get_subcategories(self):
        """Get all subcategories from selected categories"""
        from django.db.models import Count
        subcats = QuizSubCategory.objects.filter(
            category__in=self.categories.all(),
            is_active=True
        ).annotate(
            question_count=Count('questions', filter=models.Q(questions__is_active=True))
        )
        return subcats