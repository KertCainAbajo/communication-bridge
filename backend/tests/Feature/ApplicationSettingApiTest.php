<?php

namespace Tests\Feature;

use App\Models\ApplicationSetting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ApplicationSettingApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_only_public_settings_are_returned(): void
    {
        $this->seed();
        ApplicationSetting::query()->create([
            'setting_key' => 'private_demo', 'setting_value' => ['value' => 'secret'],
            'description' => 'private', 'is_public' => false,
        ]);
        $this->getJson('/api/v1/application-settings')->assertOk()
            ->assertJsonMissing(['key' => 'private_demo'])
            ->assertJsonPath('data.0.key', 'default_language');
    }
}
