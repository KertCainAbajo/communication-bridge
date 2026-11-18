<?php

namespace Tests\Feature;

use App\Models\Category;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CategoryApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_categories_are_returned_in_display_order_with_metadata(): void
    {
        $this->seed();

        $this->getJson('/api/v1/categories?language=fil')
            ->assertOk()
            ->assertJsonPath('meta.language', 'fil')
            ->assertJsonPath('data.0.slug', 'daily-needs')
            ->assertJsonPath('data.0.name', 'Daily Needs')
            ->assertJsonPath('data.0.messages_count', 15)
            ->assertJsonPath('data.4.slug', 'emergency-communication');
    }

    public function test_category_detail_is_found_by_slug(): void
    {
        $this->seed();

        $this->getJson('/api/v1/categories/daily-needs')
            ->assertOk()
            ->assertJsonPath('data.slug', 'daily-needs')
            ->assertJsonPath('data.icon', 'daily-needs');
    }

    public function test_category_messages_use_the_requested_language_and_pagination(): void
    {
        $this->seed();

        $this->getJson('/api/v1/categories/daily-needs/messages?language=fil&per_page=2')
            ->assertOk()
            ->assertJsonPath('meta.category', 'daily-needs')
            ->assertJsonPath('meta.language', 'fil')
            ->assertJsonPath('meta.total', 15)
            ->assertJsonPath('data.0.message_text', 'Gutom ako.')
            ->assertJsonCount(2, 'data');
    }

    public function test_inactive_categories_are_hidden_and_cannot_return_messages(): void
    {
        $this->seed();
        Category::query()->where('slug', 'daily-needs')->update(['is_active' => false]);

        $this->getJson('/api/v1/categories')
            ->assertOk()
            ->assertJsonMissing(['slug' => 'daily-needs']);

        $this->getJson('/api/v1/categories/daily-needs/messages')
            ->assertNotFound()
            ->assertJsonPath('success', false);
    }

    public function test_invalid_language_filter_returns_a_validation_error(): void
    {
        $this->seed();

        $this->getJson('/api/v1/categories?language=xx')
            ->assertUnprocessable()
            ->assertJsonPath('success', false)
            ->assertJsonStructure(['message', 'errors' => ['language']]);
    }
}
