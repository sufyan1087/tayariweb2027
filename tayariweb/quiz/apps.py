"""
Quiz Application Configuration
"""


from django.apps import AppConfig


class QuizConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'quiz'
    verbose_name = 'Quiz Management'
    
    def ready(self):
        """Import signals if any"""
        pass