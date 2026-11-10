from django.apps import AppConfig

class CustomQuizConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'custom_quiz'
    verbose_name = 'Custom Quiz'