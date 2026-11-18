<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\Message;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class MessageApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_messages_can_be_filtered_by_language_and_category(): void
    {
        $this->seed();
        $this->getJson('/api/v1/messages?language=ceb&category=daily-needs')
            ->assertOk()->assertJsonPath('meta.language', 'ceb')
            ->assertJsonPath('meta.category', 'daily-needs')
            ->assertJsonPath('data.0.message_text', 'Gigutom ko.');
    }

    public function test_featured_and_emergency_endpoints_return_matching_messages(): void
    {
        $this->seed();
        $this->getJson('/api/v1/messages/featured?language=fil')->assertOk()
            ->assertJsonPath('data.0.is_featured', true)
            ->assertJsonPath('data.0.message_text', 'Gutom ako.');
        $this->getJson('/api/v1/messages/emergency?language=en')->assertOk()
            ->assertJsonPath('data.0.is_emergency', true)
            ->assertJsonPath('data.0.message_text', 'I need help immediately.');
    }

    public function test_message_detail_returns_translations_media_and_category(): void
    {
        $this->seed();
        $uuid = Message::query()->where('slug', 'hungry')->value('uuid');
        $this->getJson("/api/v1/messages/{$uuid}?language=fil")->assertOk()
            ->assertJsonPath('data.slug', 'hungry')
            ->assertJsonPath('data.translation.language', 'fil')
            ->assertJsonPath('data.category.slug', 'daily-needs')
            ->assertJsonPath('data.images', []);
    }

    public function test_inactive_message_is_hidden_and_query_values_are_validated(): void
    {
        $this->seed();
        $message = Message::query()->where('slug', 'hungry')->firstOrFail();
        $message->update(['is_active' => false]);
        $this->getJson('/api/v1/messages')->assertOk()->assertJsonMissing(['slug' => 'hungry']);
        $this->getJson("/api/v1/messages/{$message->uuid}")->assertNotFound();
        $this->getJson('/api/v1/messages?language=xx')->assertUnprocessable();
        $this->getJson('/api/v1/messages?category=missing')->assertUnprocessable();
    }

    public function test_inactive_category_hides_its_messages(): void
    {
        $this->seed();
        Category::query()->where('slug', 'daily-needs')->update(['is_active' => false]);
        $this->getJson('/api/v1/messages?category=daily-needs')->assertUnprocessable();
    }
}
