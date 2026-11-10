from django.core.management.base import BaseCommand
from website.models import ContentType


class Command(BaseCommand):
    help = 'Setup default content types'

    def handle(self, *args, **kwargs):
        content_types = [
            {'name': 'Post', 'slug': 'post', 'icon': '📚', 'description': 'Study materials, notes, and guides'},
            {'name': 'Job', 'slug': 'job', 'icon': '💼', 'description': 'Job openings and career opportunities'},
            {'name': 'Scholarship', 'slug': 'scholarship', 'icon': '🎓', 'description': 'Scholarships and financial aid'},
            {'name': 'Course', 'slug': 'course', 'icon': '💻', 'description': 'Free online courses and certifications'},
        ]
        
        for ct_data in content_types:
            ct, created = ContentType.objects.get_or_create(
                slug=ct_data['slug'],
                defaults=ct_data
            )
            if created:
                self.stdout.write(self.style.SUCCESS(f'Created content type: {ct.name}'))
            else:
                self.stdout.write(f'Content type already exists: {ct.name}')
        
        self.stdout.write(self.style.SUCCESS('Setup complete!'))