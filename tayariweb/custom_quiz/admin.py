# admin.py - WITH HTML STRIPPING FOR LIST DISPLAY
from django.contrib import admin
from django import forms
from django.db import transaction
from django.utils.text import slugify
from django.shortcuts import redirect, render
from django.urls import path, reverse
from django.contrib import messages
from django.http import HttpResponse
from django.utils.safestring import mark_safe
from django.db.models import Count
from django.utils.html import strip_tags
from .models import QuizCategory, QuizSubCategory, Question, QuizPageContent
import csv
import io


class QuestionAdminForm(forms.ModelForm):
    bulk_import_file = forms.FileField(
        required=False,
        label='Bulk Import File (CSV or Excel)',
        help_text='Upload file with columns: category, subcategory, question_text, option_a, option_b, option_c, option_d, correct_answer, difficulty, explanation, tags',
        widget=forms.ClearableFileInput(attrs={'accept': '.csv,.xlsx,.xls'})
    )
    
    class Meta:
        model = Question
        fields = '__all__'
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if self.instance.pk:
            self.fields['bulk_import_file'].widget = forms.HiddenInput()
            self.fields['bulk_import_file'].required = False


class BulkImportParser:
    REQUIRED_COLUMNS = ['question_text', 'option_a', 'option_b', 'option_c', 'option_d', 'correct_answer']
    
    def __init__(self, file):
        self.file = file
        self.errors = []
        self.questions = []
        self.stats = {'processed': 0, 'valid': 0, 'invalid': 0}
    
    def parse(self):
        filename = self.file.name.lower()
        
        try:
            if filename.endswith('.csv'):
                return self._parse_csv()
            elif filename.endswith(('.xlsx', '.xls')):
                return self._parse_excel()
            else:
                self.errors.append({'row': 0, 'error': 'Unsupported file format. Use .csv, .xlsx, or .xls'})
                return False
        except Exception as e:
            self.errors.append({'row': 0, 'error': f'File parse error: {str(e)}'})
            return False
    
    def _parse_csv(self):
        try:
            self.file.seek(0)
            decoded = self.file.read().decode('utf-8-sig')
            reader = csv.DictReader(io.StringIO(decoded))
            return self._process_rows(reader)
        except Exception as e:
            self.errors.append({'row': 0, 'error': f'CSV parse error: {str(e)}'})
            return False
    
    def _parse_excel(self):
        try:
            import openpyxl
        except ImportError:
            self.errors.append({'row': 0, 'error': 'Excel support requires: pip install openpyxl'})
            return False
        
        try:
            self.file.seek(0)
            wb = openpyxl.load_workbook(self.file, data_only=True)
            ws = wb.active
            
            headers = [str(cell.value).strip() if cell.value else '' for cell in ws[1]]
            
            missing = [col for col in self.REQUIRED_COLUMNS if col not in headers]
            if missing:
                self.errors.append({'row': 0, 'error': f'Missing required columns: {", ".join(missing)}'})
                return False
            
            for row_num, row in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
                self.stats['processed'] += 1
                row_data = {}
                for i, header in enumerate(headers):
                    if header and i < len(row):
                        row_data[header] = str(row[i]) if row[i] is not None else ''
                    elif header:
                        row_data[header] = ''
                
                if self._validate_row(row_data, row_num):
                    self.stats['valid'] += 1
            
            return len(self.errors) == 0
            
        except Exception as e:
            self.errors.append({'row': 0, 'error': f'Excel parse error: {str(e)}'})
            return False
    
    def _process_rows(self, reader):
        headers = reader.fieldnames or []
        
        missing = [col for col in self.REQUIRED_COLUMNS if col not in headers]
        if missing:
            self.errors.append({'row': 0, 'error': f'Missing required columns: {", ".join(missing)}'})
            return False
        
        for row_num, row in enumerate(reader, start=2):
            self.stats['processed'] += 1
            clean_row = {k: str(v).strip() if v is not None else '' for k, v in row.items()}
            if self._validate_row(clean_row, row_num):
                self.stats['valid'] += 1
        
        return len(self.errors) == 0
    
    def _validate_row(self, row, row_num):
        try:
            for field in self.REQUIRED_COLUMNS:
                value = row.get(field, '').strip()
                if not value:
                    raise ValueError(f'Missing required field: {field}')
            
            correct = str(row.get('correct_answer', '')).strip().upper()
            answer_map = {'A': 0, 'B': 1, 'C': 2, 'D': 3, '0': 0, '1': 1, '2': 2, '3': 3}
            
            if correct not in answer_map:
                raise ValueError(f'Invalid correct_answer "{correct}". Use A, B, C, D or 0, 1, 2, 3')
            
            difficulty = str(row.get('difficulty', 'medium')).lower().strip()
            if difficulty not in ['easy', 'medium', 'hard']:
                difficulty = 'medium'
            
            question_data = {
                'category': str(row.get('category', '')).strip(),
                'subcategory': str(row.get('subcategory', '')).strip(),
                'question_text': str(row.get('question_text', '')).strip(),
                'option_a': str(row.get('option_a', '')).strip(),
                'option_b': str(row.get('option_b', '')).strip(),
                'option_c': str(row.get('option_c', '')).strip(),
                'option_d': str(row.get('option_d', '')).strip(),
                'correct_answer': answer_map[correct],
                'difficulty': difficulty,
                'explanation': str(row.get('explanation', '')).strip(),
                'tags': str(row.get('tags', '')).strip(),
            }
            
            self.questions.append(question_data)
            return True
            
        except Exception as e:
            self.errors.append({'row': row_num, 'error': str(e)})
            return False


class QuestionInline(admin.TabularInline):
    model = Question
    extra = 0
    fields = ['truncated_text', 'difficulty', 'correct_answer', 'is_active']
    readonly_fields = ['truncated_text']
    can_delete = True
    max_num = 0
    ordering = ['-created_at']
    
    def truncated_text(self, obj):
        # Strip HTML tags for clean display
        clean_text = strip_tags(obj.question_text)
        return clean_text[:80] + '...' if len(clean_text) > 80 else clean_text
    truncated_text.short_description = 'Question'


@admin.register(QuizCategory)
class QuizCategoryAdmin(admin.ModelAdmin):
    list_display = ['name', 'slug', 'order', 'is_active', 'subcategory_count', 'total_questions', 'view_questions_link']
    prepopulated_fields = {'slug': ('name',)}
    search_fields = ['name', 'description']
    list_editable = ['order', 'is_active']
    
    def subcategory_count(self, obj):
        return obj.subcategories.count()
    subcategory_count.short_description = 'Sub Categories'
    
    def total_questions(self, obj):
        count = Question.objects.filter(subcategory__category=obj, is_active=True).count()
        return f"{count} questions"
    total_questions.short_description = 'Total Questions'
    
    def view_questions_link(self, obj):
        count = Question.objects.filter(subcategory__category=obj).count()
        if count > 0:
            url = reverse('admin:custom_quiz_question_changelist') + f'?subcategory__category__id__exact={obj.id}'
            return mark_safe(f'<a href="{url}" style="background: #417690; color: white; padding: 5px 10px; border-radius: 3px; text-decoration: none;">View {count} Questions</a>')
        return "No questions"
    view_questions_link.short_description = 'Actions'


@admin.register(QuizSubCategory)
class QuizSubCategoryAdmin(admin.ModelAdmin):
    list_display = [
        'name', 
        'category_link', 
        'order', 
        'is_active', 
        'question_count', 
        'difficulty_breakdown',
        'view_questions_link'
    ]
    list_filter = ['category', 'is_active']
    prepopulated_fields = {'slug': ('name',)}
    search_fields = ['name', 'category__name', 'description']
    list_editable = ['order', 'is_active']
    ordering = ['category__name', 'order', 'name']
    inlines = [QuestionInline]
    
    def get_queryset(self, request):
        return super().get_queryset(request).select_related('category')
    
    def category_link(self, obj):
        if obj.category:
            return obj.category.name
        return "-"
    category_link.short_description = 'Parent Category'
    category_link.admin_order_field = 'category__name'
    
    def question_count(self, obj):
        count = obj.questions.filter(is_active=True).count()
        total = obj.questions.count()
        if count != total:
            return f"{count} active / {total} total"
        return f"{count} questions"
    question_count.short_description = 'Questions'
    
    def difficulty_breakdown(self, obj):
        easy = obj.questions.filter(difficulty='easy', is_active=True).count()
        medium = obj.questions.filter(difficulty='medium', is_active=True).count()
        hard = obj.questions.filter(difficulty='hard', is_active=True).count()
        
        return mark_safe(
            f'<span style="color: #28a745; font-weight: bold;">E:{easy}</span> '
            f'<span style="color: #ffc107; font-weight: bold;">M:{medium}</span> '
            f'<span style="color: #dc3545; font-weight: bold;">H:{hard}</span>'
        )
    difficulty_breakdown.short_description = 'Difficulty'
    
    def view_questions_link(self, obj):
        count = obj.questions.count()
        if count > 0:
            url = reverse('admin:custom_quiz_question_changelist') + f'?subcategory__id__exact={obj.id}'
            return mark_safe(f'<a href="{url}" style="background: #79aec8; color: white; padding: 5px 10px; border-radius: 3px; text-decoration: none;">View {count}</a>')
        return "-"
    view_questions_link.short_description = 'View'


@admin.register(Question)
class QuestionAdmin(admin.ModelAdmin):
    form = QuestionAdminForm
    
    list_display = [
        'truncated_text', 
        'subcategory_info', 
        'category_info', 
        'difficulty_badge', 
        'correct_answer_display', 
        'is_active', 
        'created_at'
    ]
    
    list_filter = [
        ('subcategory__category', admin.RelatedOnlyFieldListFilter),
        'subcategory',
        'difficulty', 
        'is_active', 
        'created_at'
    ]
    
    search_fields = [
        'question_text', 
        'explanation', 
        'tags', 
        'subcategory__name', 
        'subcategory__category__name'
    ]
    
    ordering = ['subcategory__category__name', 'subcategory__name', '-created_at']
    list_select_related = ['subcategory', 'subcategory__category']
    list_per_page = 50
    save_as = True
    
    actions = ['move_to_subcategory', 'duplicate_questions']
    
    fieldsets = (
        ('Bulk Import (CSV or Excel)', {
            'fields': ('bulk_import_file',),
            'classes': ('wide',),
            'description': mark_safe('''
                <strong>Bulk Import Instructions:</strong><br>
                Upload CSV/Excel with columns: <code>category, subcategory, question_text, option_a, option_b, option_c, option_d, correct_answer, difficulty, explanation, tags</code><br>
                <strong>Auto-detection:</strong> Categories and subcategories will be created automatically based on file content.<br>
                <a href="?download_template=1" style="background: #417690; color: white; padding: 8px 15px; border-radius: 4px; text-decoration: none; display: inline-block; margin-top: 10px;">Download Sample CSV</a>
            ''')
        }),
        ('Question Details', {
            'fields': ('subcategory', 'question_text', 'difficulty', 'tags', 'is_active')
        }),
        ('Answer Options', {
            'fields': (('option_a', 'option_b'), ('option_c', 'option_d'), 'correct_answer'),
            'classes': ('wide',)
        }),
        ('Explanation (Rich Text)', {
            'fields': ('explanation',),
            'classes': ('collapse',)
        }),
    )
    
    def get_queryset(self, request):
        qs = super().get_queryset(request)
        return qs.select_related('subcategory', 'subcategory__category')
    
    def truncated_text(self, obj):
        # Strip HTML tags for clean display in admin list
        clean_text = strip_tags(obj.question_text)
        return clean_text[:80] + '...' if len(clean_text) > 80 else clean_text
    truncated_text.short_description = 'Question Text'
    truncated_text.admin_order_field = 'question_text'
    
    def subcategory_info(self, obj):
        if obj.subcategory:
            return obj.subcategory.name
        return "-"
    subcategory_info.short_description = 'Sub Category'
    subcategory_info.admin_order_field = 'subcategory__name'
    
    def category_info(self, obj):
        if obj.subcategory and obj.subcategory.category:
            return obj.subcategory.category.name
        return "-"
    category_info.short_description = 'Main Category'
    category_info.admin_order_field = 'subcategory__category__name'
    
    def difficulty_badge(self, obj):
        colors = {
            'easy': '#28a745',
            'medium': '#ffc107', 
            'hard': '#dc3545'
        }
        color = colors.get(obj.difficulty, '#6c757d')
        return mark_safe(f'<span style="background-color: {color}; color: white; padding: 3px 8px; border-radius: 3px; font-size: 11px; font-weight: bold;">{obj.get_difficulty_display().upper()}</span>')
    difficulty_badge.short_description = 'Difficulty'
    
    def correct_answer_display(self, obj):
        options = ['A', 'B', 'C', 'D']
        return options[obj.correct_answer] if 0 <= obj.correct_answer <= 3 else '?'
    correct_answer_display.short_description = 'Answer'
    
    def download_template(self, request):
        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = 'attachment; filename="quiz_import_template.csv"'
        
        writer = csv.writer(response)
        writer.writerow([
            'category', 'subcategory', 'question_text', 'option_a', 'option_b', 
            'option_c', 'option_d', 'correct_answer', 'difficulty', 'explanation', 'tags'
        ])
        writer.writerow([
            'Computer Science', 'Networking', 'What is the full form of WWW?', 
            'World Wide Web', 'World Wide Word', 'World Web Wide', 'Wide World Web', 
            'A', 'easy', 'WWW stands for World Wide Web', 'cs,networking,internet'
        ])
        writer.writerow([
            'General Knowledge', 'Pakistan Affairs', 'How many provinces in Pakistan?', 
            '3', '4', '5', '6', 'B', 'easy',
            'Pakistan has 4 provinces', 'pakistan,gk,geography'
        ])
        writer.writerow([
            'ISSB', 'Verbal Intelligence', 'Synonym of ABUNDANT?', 
            'Scarce', 'Plentiful', 'Rare', 'Small', 'B', 'medium',
            'Abundant means plentiful', 'issb,vocabulary,english'
        ])
        
        return response
    
    def add_view(self, request, form_url='', extra_context=None):
        if request.GET.get('download_template'):
            return self.download_template(request)
        
        if request.method == 'POST':
            if 'bulk_import_file' in request.FILES:
                file = request.FILES['bulk_import_file']
                if file and file.name:
                    return self._handle_bulk_import(request)
        
        return super().add_view(request, form_url, extra_context)
    
    def _handle_bulk_import(self, request):
        file = request.FILES['bulk_import_file']
        
        if file.size == 0:
            messages.error(request, "Uploaded file is empty")
            return redirect(request.path)
        
        parser = BulkImportParser(file)
        success = parser.parse()
        
        if parser.errors:
            for error in parser.errors[:10]:
                messages.error(request, f"Row {error['row']}: {error['error']}")
            if len(parser.errors) > 10:
                messages.error(request, f"... and {len(parser.errors) - 10} more errors")
            return redirect(request.path)
        
        if not parser.questions:
            messages.warning(request, "No valid questions found in file")
            return redirect(request.path)
        
        result = self._import_questions_with_categories(parser.questions, request)
        
        msg = f"Import complete! Created: {result['created']}, Updated: {result['updated']}, Errors: {result['errors']}"
        
        if result['categories']:
            cat_list = ", ".join([f"{cat} ({count})" for cat, count in result['categories'].items()])
            msg += f"<br><strong>Categories:</strong> {cat_list}"
        
        if result['errors'] == 0:
            messages.success(request, mark_safe(msg))
        else:
            messages.warning(request, mark_safe(msg))
        
        return redirect(reverse('admin:custom_quiz_question_changelist'))
    
    @transaction.atomic
    def _import_questions_with_categories(self, questions_data, request):
        created = 0
        updated = 0
        errors = 0
        category_stats = {}
        
        for q_data in questions_data:
            try:
                category_name = q_data.get('category', '').strip()
                subcategory_name = q_data.get('subcategory', '').strip()
                
                if not category_name or not subcategory_name:
                    messages.error(request, f"Missing category/subcategory for: {q_data['question_text'][:50]}...")
                    errors += 1
                    continue
                
                category, cat_created = QuizCategory.objects.get_or_create(
                    name__iexact=category_name,
                    defaults={
                        'name': category_name,
                        'slug': slugify(category_name),
                        'is_active': True
                    }
                )
                
                subcategory, sub_created = QuizSubCategory.objects.get_or_create(
                    category=category,
                    name__iexact=subcategory_name,
                    defaults={
                        'name': subcategory_name,
                        'slug': slugify(subcategory_name),
                        'is_active': True
                    }
                )
                
                cat_key = f"{category.name} → {subcategory.name}"
                if cat_key not in category_stats:
                    category_stats[cat_key] = {'created': 0, 'updated': 0}
                
                existing = Question.objects.filter(
                    subcategory=subcategory,
                    question_text__iexact=q_data['question_text']
                ).first()
                
                if existing:
                    is_exact = (
                        existing.option_a == q_data['option_a'] and
                        existing.option_b == q_data['option_b'] and
                        existing.option_c == q_data['option_c'] and
                        existing.option_d == q_data['option_d'] and
                        existing.correct_answer == q_data['correct_answer']
                    )
                    
                    if is_exact:
                        continue
                    
                    existing.option_a = q_data['option_a']
                    existing.option_b = q_data['option_b']
                    existing.option_c = q_data['option_c']
                    existing.option_d = q_data['option_d']
                    existing.correct_answer = q_data['correct_answer']
                    existing.difficulty = q_data['difficulty']
                    existing.explanation = q_data['explanation']
                    existing.tags = q_data['tags']
                    existing.is_active = True
                    existing.save()
                    updated += 1
                    category_stats[cat_key]['updated'] += 1
                else:
                    Question.objects.create(
                        subcategory=subcategory,
                        question_text=q_data['question_text'],
                        option_a=q_data['option_a'],
                        option_b=q_data['option_b'],
                        option_c=q_data['option_c'],
                        option_d=q_data['option_d'],
                        correct_answer=q_data['correct_answer'],
                        difficulty=q_data['difficulty'],
                        explanation=q_data['explanation'],
                        tags=q_data['tags'],
                        is_active=True
                    )
                    created += 1
                    category_stats[cat_key]['created'] += 1
                    
            except Exception as e:
                messages.error(request, f"Error: {str(e)}")
                errors += 1
        
        formatted_stats = {}
        for cat_key, stats in category_stats.items():
            total = stats['created'] + stats['updated']
            formatted_stats[cat_key] = f"{stats['created']} new, {stats['updated']} updated"
        
        return {
            'created': created,
            'updated': updated,
            'errors': errors,
            'categories': formatted_stats
        }
    
    def move_to_subcategory(self, request, queryset):
        from django.http import HttpResponseRedirect
        
        if 'apply' in request.POST:
            subcategory_id = request.POST.get('subcategory')
            if subcategory_id:
                subcategory = QuizSubCategory.objects.get(pk=subcategory_id)
                count = queryset.update(subcategory=subcategory)
                messages.success(request, f"Moved {count} questions to {subcategory.name}")
                return HttpResponseRedirect(request.get_full_path())
        
        form = MoveToSubcategoryForm()
        return render(request, 'admin/custom_quiz/move_questions.html', {
            'questions': queryset,
            'form': form,
            'action_checkbox_name': admin.helpers.ACTION_CHECKBOX_NAME,
        })
    move_to_subcategory.short_description = "Move selected questions to subcategory"
    
    def duplicate_questions(self, request, queryset):
        count = 0
        for question in queryset:
            question.pk = None
            question.question_text = f"[COPY] {question.question_text}"
            question.save()
            count += 1
        messages.success(request, f"Duplicated {count} questions")
    duplicate_questions.short_description = "Duplicate selected questions"


class MoveToSubcategoryForm(forms.Form):
    subcategory = forms.ModelChoiceField(
        queryset=QuizSubCategory.objects.all().select_related('category'),
        label="Select Target Subcategory"
    )
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields['subcategory'].label_from_instance = lambda obj: f"{obj.category.name} → {obj.name}"


@admin.register(QuizPageContent)
class QuizPageContentAdmin(admin.ModelAdmin):
    list_display = ['page_key', 'selected_categories', 'heading', 'is_active', 'updated_at']
    list_filter = ['categories', 'is_active', 'created_at']
    search_fields = ['page_key', 'heading', 'meta_title', 'meta_description']
    filter_horizontal = ['categories']  # Better UI for ManyToMany
    
    fieldsets = (
        ('Page Settings', {
            'fields': ('page_key', 'categories', 'is_active')
        }),
        ('SEO Settings', {
            'fields': ('meta_title', 'meta_description', 'meta_keywords', 'canonical_url'),
            'classes': ('collapse',)
        }),
        ('Header Content', {
            'fields': ('heading', 'subheading')
        }),
        ('Hero Section', {
            'fields': ('hero_title', 'hero_description', 'hero_image'),
            'classes': ('collapse',)
        }),
        ('Features Section', {
            'fields': ('features_title', 'features'),
            'classes': ('collapse',)
        }),
        ('Main Content', {
            'fields': ('content_title', 'main_content'),
            'classes': ('collapse',)
        }),
        ('FAQ Section', {
            'fields': ('faq_title', 'faqs'),
            'classes': ('collapse',)
        }),
        ('Call to Action', {
            'fields': ('cta_title', 'cta_description', 'cta_button_text'),
            'classes': ('collapse',)
        }),
        ('Default Quiz Settings', {
            'fields': ('default_question_count', 'default_time_limit'),
            'description': 'Default values for quiz generator on this page'
        }),
        ('Display Options', {
            'fields': ('show_hero', 'show_features', 'show_content', 'show_faq', 'show_stats'),
            'classes': ('collapse',)
        }),
    )
    
    def selected_categories(self, obj):
        cats = obj.categories.all()
        if cats:
            return ", ".join([c.name for c in cats])
        return "No categories selected"
    selected_categories.short_description = 'Categories'