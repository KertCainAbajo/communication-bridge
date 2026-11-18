<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\Language;
use App\Models\Message;
use App\Models\Translation;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ContentRelationshipTest extends TestCase
{
    use RefreshDatabase;

    public function test_seeded_message_category_language_translation_relationships_are_connected(): void
    {
        $this->seed();
        $message = Message::query()->where('slug', 'hungry')->with(['category', 'translations.language'])->firstOrFail();
        $this->assertInstanceOf(Category::class, $message->category);
        $this->assertSame('daily-needs', $message->category->slug);
        $this->assertCount(3, $message->translations);
        $filipino = $message->translations->first(fn (Translation $translation): bool => $translation->language->code === 'fil');
        $this->assertNotNull($filipino);
        $this->assertSame('Gutom ako.', $filipino->message_text);
        $this->assertSame(3, Language::query()->count());
    }
}
