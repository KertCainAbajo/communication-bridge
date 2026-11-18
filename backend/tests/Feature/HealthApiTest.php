<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class HealthApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_versioned_health_endpoint_reports_application_and_database_status(): void
    {
        $response = $this->getJson('/api/v1/health');

        $response->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.status', 'ok')
            ->assertJsonPath('data.database.status', 'connected')
            ->assertJsonStructure(['success', 'message', 'data' => ['status', 'database' => ['status'], 'checked_at'], 'meta']);

        $this->assertArrayNotHasKey('host', $response->json('data.database'));
        $this->assertArrayNotHasKey('password', $response->json('data.database'));
    }

    public function test_legacy_health_endpoint_remains_available_for_the_existing_expo_screen(): void
    {
        $this->getJson('/api/health')
            ->assertOk()
            ->assertJsonPath('status', 'ok');
    }
}
