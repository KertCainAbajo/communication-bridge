<?php

namespace Tests\Feature;

use App\Models\Message;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SyncApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_full_sync_returns_content_collections_and_version(): void
    {
        $this->seed();
        $this->getJson('/api/v1/sync')->assertOk()
            ->assertJsonPath('meta.incremental', false)
            ->assertJsonStructure(['meta' => ['content_version'], 'data' => ['languages', 'categories', 'messages', 'translations', 'images', 'audio']])
            ->assertJsonCount(3, 'data.languages')
            ->assertJsonCount(5, 'data.categories')
            ->assertJsonCount(69, 'data.messages')
            ->assertJsonCount(207, 'data.translations');
    }

    public function test_sync_validates_since_and_returns_incremental_rows_when_given(): void
    {
        $this->seed();
        $this->getJson('/api/v1/sync?since=not-a-date')->assertUnprocessable();
        $this->getJson('/api/v1/sync?since=2099-01-01T00:00:00Z')->assertOk()
            ->assertJsonPath('meta.incremental', true)
            ->assertJsonCount(0, 'data.messages');
        $message = Message::query()->where('slug', 'hungry')->firstOrFail();
        $message->update(['is_active' => false]);
        $this->getJson('/api/v1/sync?since=2000-01-01T00:00:00Z')->assertOk()
            ->assertJsonPath('data.messages.0.is_active', false);
    }
}
