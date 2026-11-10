"""
Quiz Application Forms
Can be used for admin custom views or frontend forms
"""

from django import forms
from .models import Quiz, Question


class QuizSettingsForm(forms.ModelForm):
    """
    Form for admin to quickly update quiz settings
    """
    class Meta:
        model = Quiz
        fields = [
            'time_limit_minutes',
            'total_questions',
            'passing_percentage',
            'has_negative_marking',
            'negative_marking_value',
            'marks_per_question',
            'is_active'
        ]
        widgets = {
            'time_limit_minutes': forms.NumberInput(attrs={'min': 1, 'max': 180}),
            'total_questions': forms.NumberInput(attrs={'min': 1, 'max': 100}),
            'passing_percentage': forms.NumberInput(attrs={'min': 1, 'max': 100}),
            'negative_marking_value': forms.NumberInput(attrs={'step': '0.25', 'min': '0.25', 'max': '1.00'}),
        }


class QuestionBulkUploadForm(forms.Form):
    """
    Form for bulk uploading questions via CSV/Excel
    (To be implemented with import logic)
    """
    file = forms.FileField(
        help_text="Upload CSV file with questions"
    )
    quiz = forms.ModelChoiceField(
        queryset=Quiz.objects.all(),
        help_text="Select quiz to add questions to"
    )