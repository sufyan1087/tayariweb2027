from django.contrib import admin
from django import forms
from django.contrib import messages
from django.utils.html import format_html
from django.urls import path, reverse
from django.http import HttpResponse, HttpResponseRedirect
from .models import Quiz, Question, QuizAttempt, QuizComment, Article
from .import_utils import import_questions_from_excel
import pandas as pd
import io


# ==================== QUIZ ADMIN ====================

class QuestionInline(admin.TabularInline):
    model = Question
    extra = 0
    fields = ['order', 'question_text', 'question_type', 'option_a', 'option_b', 
              'option_c', 'option_d', 'correct_option', 'correct_boolean', 
              'correct_text', 'explanation', 'is_active']
    show_change_link = True
    
    def get_extra(self, request, obj=None, **kwargs):
        if obj and obj.questions.count() > 0:
            return 0
        return 3


class QuizAdminForm(forms.ModelForm):
    excel_file = forms.FileField(
        required=False,
        label='📥 Bulk Import Questions (Excel)',
        help_text='Upload Excel file then click "Save and continue editing" to see imported questions below'
    )
    
    class Meta:
        model = Quiz
        fields = '__all__'


@admin.register(Quiz)
class QuizAdmin(admin.ModelAdmin):
    form = QuizAdminForm
    inlines = [QuestionInline]
    
    # FIXED: Removed 'is_published' from list_filter, use 'status' instead
    list_display = ['title', 'token', 'category', 'difficulty', 'status', 'question_count', 'time_limit_minutes', 'created_at']
    list_filter = ['status', 'difficulty', 'category', 'created_at']  # REMOVED 'is_published'
    list_editable = ['status']
    search_fields = ['title', 'token', 'description']
    prepopulated_fields = {'slug': ('title',)}
    readonly_fields = ['token', 'token_display', 'embed_code', 'share_url_display', 'created_at', 'updated_at']
    
    fieldsets = (
        ('Quiz Info', {
            'fields': ('title', 'slug', 'description', 'category', 'difficulty', 'status')
        }),
        ('Settings', {
            'fields': ('time_limit_minutes', 'total_questions_to_show', 'passing_percentage')
        }),
        ('Scoring', {
            'fields': ('marks_per_correct', 'marks_per_wrong'),
            'classes': ('collapse',),
        }),
        ('Bulk Import', {
            'fields': ('excel_file',),
            'description': 'Upload Excel file with columns: question_text, question_type, option_a, option_b, option_c, option_d, correct_option, explanation'
        }),
        ('Embed & Share', {
            'fields': ('token', 'token_display', 'embed_code', 'share_url_display'),
            'classes': ('collapse',),
        }),
    )
    
    def get_urls(self):
        urls = super().get_urls()
        custom_urls = [
            path('download-template/', self.download_excel_template, name='download_excel_template'),
        ]
        return custom_urls + urls
    
    def download_excel_template(self, request):
        """Download sample Excel template with 15 MCQs"""
        data = {
            'order': list(range(1, 16)),
            'question_text': [
                'What is the capital of France?',
                'Which planet is known as the Red Planet?',
                'What is 15 × 4?',
                'Who wrote "Romeo and Juliet"?',
                'What is the chemical symbol for gold?',
                'How many continents are there on Earth?',
                'What is the largest organ in the human body?',
                'In which year did World War II end?',
                'What is the speed of light approximately?',
                'Which gas do plants absorb from the atmosphere?',
                'Who painted the Mona Lisa?',
                'What is the smallest prime number?',
                'Which ocean is the largest?',
                'What does "CPU" stand for?',
                'How many sides does a hexagon have?'
            ],
            'question_type': ['mcq'] * 15,
            'option_a': ['London', 'Venus', '45', 'Charles Dickens', 'Go', '5', 'Heart', '1943', '150,000 km/s', 'Oxygen', 'Vincent van Gogh', '0', 'Atlantic Ocean', 'Central Process Unit', '4'],
            'option_b': ['Berlin', 'Mars', '50', 'William Shakespeare', 'Gd', '6', 'Brain', '1944', '200,000 km/s', 'Carbon Dioxide', 'Pablo Picasso', '1', 'Indian Ocean', 'Computer Personal Unit', '5'],
            'option_c': ['Paris', 'Jupiter', '60', 'Jane Austen', 'Ag', '7', 'Liver', '1945', '300,000 km/s', 'Nitrogen', 'Leonardo da Vinci', '2', 'Arctic Ocean', 'Central Processing Unit', '6'],
            'option_d': ['Madrid', 'Saturn', '75', 'Mark Twain', 'Au', '8', 'Skin', '1946', '400,000 km/s', 'Hydrogen', 'Michelangelo', '3', 'Pacific Ocean', 'Central Processor Unit', '8'],
            'correct_option': ['c', 'b', 'c', 'b', 'd', 'c', 'd', 'c', 'c', 'b', 'c', 'c', 'd', 'c', 'c'],
            'explanation': [
                'Paris is the capital and largest city of France.',
                'Mars appears red due to iron oxide (rust) on its surface.',
                '15 × 4 = 60',
                'William Shakespeare wrote this famous tragedy around 1594-1596.',
                'Au comes from the Latin word "aurum" meaning gold.',
                'There are 7 continents: Asia, Africa, North America, South America, Antarctica, Europe, and Australia.',
                'The skin is the largest organ, covering about 20 square feet in adults.',
                'World War II ended in 1945 with the surrender of Germany and Japan.',
                'Light travels at approximately 299,792 km/s (often rounded to 300,000 km/s).',
                'Plants absorb CO2 during photosynthesis and release oxygen.',
                'Leonardo da Vinci painted the Mona Lisa between 1503-1519.',
                '2 is the smallest prime number and the only even prime.',
                'The Pacific Ocean covers about 63 million square miles.',
                'CPU stands for Central Processing Unit, the brain of a computer.',
                'A hexagon has 6 sides. "Hex" means six in Greek.'
            ]
        }
        
        df = pd.DataFrame(data)
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df.to_excel(writer, index=False, sheet_name='Questions')
        output.seek(0)
        
        response = HttpResponse(
            output.read(),
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
        response['Content-Disposition'] = 'attachment; filename="sample_quiz_questions.xlsx"'
        return response
    
    def token_display(self, obj):
        if obj.token:
            return format_html(
                '<div style="background: #f3f4f6; padding: 10px; border-radius: 4px; font-family: monospace;">'
                '<span>{}</span>'
                '<button type="button" onclick="navigator.clipboard.writeText(\'{}\')" '
                'style="margin-left: 10px; padding: 5px 10px; cursor: pointer; background: #3b82f6; color: white; border: none; border-radius: 4px;">'
                '📋 Copy</button>'
                '</div>',
                obj.token, obj.token
            )
        return format_html('<span style="color: #6b7280;">Save to generate token</span>')
    token_display.short_description = 'Access Token'
    
    def embed_code(self, obj):
        """Display embed code in admin"""
        if obj.token:
            return format_html(
                '<code style="background:#f3f4f6;padding:4px 8px;border-radius:4px;">{{{{quiz:{}}}}}</code>',
                obj.token
            )
        return "Save to generate token"
    embed_code.short_description = "Embed Code"
    
    def share_url_display(self, obj):
        if obj.slug:
            return format_html(
                '<div style="background: #f3f4f6; padding: 10px; border-radius: 4px; font-family: monospace; word-break: break-all;">'
                '<span>/quizzes/{}/</span>'
                '</div>',
                obj.slug
            )
        return format_html('<span style="color: #6b7280;">Save to generate URL</span>')
    share_url_display.short_description = 'Share URL'
    
    def question_count(self, obj):
        return obj.questions.filter(is_active=True).count()
    question_count.short_description = 'Questions'
    
    def save_model(self, request, obj, form, change):
        self._excel_file = form.cleaned_data.get('excel_file')
        if not change:
            obj.created_by = request.user
        super().save_model(request, obj, form, change)
    
    def save_related(self, request, form, formsets, change):
        super().save_related(request, form, formsets, change)
        
        excel_file = getattr(self, '_excel_file', None)
        if excel_file:
            try:
                file_content = excel_file.read()
                if not file_content:
                    messages.error(request, '❌ Uploaded file is empty!')
                    return
                
                excel_buffer = io.BytesIO(file_content)
                questions_created, errors = import_questions_from_excel(form.instance, excel_buffer)
                
                if questions_created > 0:
                    messages.success(request, f'✅ Imported {questions_created} questions!')
                    self._just_imported = True
                else:
                    messages.warning(request, '⚠️ No questions imported')
                
                for error in errors[:5]:
                    messages.error(request, f'❌ {error}')
                    
            except Exception as e:
                messages.error(request, f'❌ Import failed: {str(e)}')
    
    def response_change(self, request, obj):
        if getattr(self, '_just_imported', False):
            self._just_imported = False
            return HttpResponseRedirect(
                reverse('admin:quiz_quiz_change', args=[obj.pk])
            )
        return super().response_change(request, obj)
    
    def response_add(self, request, obj):
        if getattr(self, '_just_imported', False):
            self._just_imported = False
            return HttpResponseRedirect(
                reverse('admin:quiz_quiz_change', args=[obj.pk])
            )
        return super().response_add(request, obj)


# ==================== ARTICLE ADMIN ====================

@admin.register(Article)
class ArticleAdmin(admin.ModelAdmin):
    list_display = ['title', 'status', 'get_quiz_tokens', 'published_at', 'created_at']
    list_filter = ['status', 'category', 'created_at']
    search_fields = ['title', 'content', 'slug']
    prepopulated_fields = {'slug': ('title',)}
    
    fieldsets = (
        (None, {
            'fields': ('title', 'slug', 'excerpt', 'content', 'featured_quiz')
        }),
        ('Media', {
            'fields': ('featured_image', 'category')
        }),
        ('SEO', {
            'fields': ('meta_title', 'meta_description'),
            'classes': ('collapse',)
        }),
        ('Publishing', {
            'fields': ('status', 'is_published', 'published_at')
        }),
    )
    
    def get_quiz_tokens(self, obj):
        """Show which quiz tokens are used in article"""
        tokens = obj.extract_quiz_tokens()
        if tokens:
            return ", ".join([f"{{quiz:{t}}}" for t in tokens[:3]])
        return "-"
    get_quiz_tokens.short_description = "Quiz Tokens"


# ==================== OTHER ADMINS ====================

@admin.register(Question)
class QuestionAdmin(admin.ModelAdmin):
    list_display = ['quiz', 'question_text_preview', 'question_type', 'order', 'is_active']
    list_filter = ['quiz', 'question_type', 'is_active']
    search_fields = ['question_text', 'quiz__title']
    list_editable = ['is_active', 'order']
    
    def question_text_preview(self, obj):
        return obj.question_text[:60] + "..." if len(obj.question_text) > 60 else obj.question_text
    question_text_preview.short_description = 'Question'


@admin.register(QuizAttempt)
class QuizAttemptAdmin(admin.ModelAdmin):
    list_display = ['quiz', 'user', 'score', 'is_completed', 'started_at']
    list_filter = ['is_completed', 'quiz']


@admin.register(QuizComment)
class QuizCommentAdmin(admin.ModelAdmin):
    list_display = ['attempt', 'user', 'text_preview', 'created_at']
    
    def text_preview(self, obj):
        return obj.text[:50] + "..." if len(obj.text) > 50 else obj.text
    text_preview.short_description = 'Comment'