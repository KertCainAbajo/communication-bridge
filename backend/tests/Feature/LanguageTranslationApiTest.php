<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class LanguageTranslationApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_supported_languages_are_listed_and_detail_is_available(): void
    {
        $this->seed();
        $this->getJson('/api/v1/languages')->assertOk()->assertJsonCount(3, 'data');
        $this->getJson('/api/v1/languages/ceb')->assertOk()
            ->assertJsonPath('data.code', 'ceb')->assertJsonPath('data.name', 'Bisaya (Cebuano)');
    }

    public function test_translations_can_be_retrieved_by_language_including_fil_and_ceb(): void
    {
        $this->seed();
        $this->getJson('/api/v1/translations/fil?per_page=100')->assertOk()
            ->assertJsonPath('meta.language', 'fil')->assertJsonPath('meta.total', 69);
        $this->getJson('/api/v1/translations/ceb?per_page=100')->assertOk()
            ->assertJsonPath('meta.language', 'ceb')->assertJsonPath('meta.total', 69)
            ->assertJsonPath('data.0.language', 'ceb');
    }

    public function test_translation_filter_rejects_unknown_language(): void
    {
        $this->seed();
        $this->getJson('/api/v1/translations?language=xx')->assertUnprocessable()
            ->assertJsonPath('success', false);
    }
}
