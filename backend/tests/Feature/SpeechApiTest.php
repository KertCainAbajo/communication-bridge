<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class SpeechApiTest extends TestCase
{
    public function test_speech_reports_when_online_speech_is_not_configured(): void
    {
        config(['communication.giggy_api_key' => null]);
        Http::preventStrayRequests();

        $this->postJson('/api/v1/speech', ['text' => 'Gutom ako.', 'language' => 'fil'])
            ->assertStatus(503)
            ->assertJsonPath('success', false);
    }

    public function test_speech_returns_a_playable_audio_path(): void
    {
        config(['communication.giggy_api_key' => 'test-key']);
        Cache::flush();
        Storage::fake('local');
        Http::fake([
            'api.giggy.ai/v1/voices*' => Http::response(['voices' => [['voice_id' => 'voice-fil']]]),
            'api.giggy.ai/v1/text-to-speech' => Http::response('mp3-bytes', 200, ['Content-Type' => 'audio/mpeg']),
        ]);

        $audioPath = $this->postJson('/api/v1/speech', ['text' => 'Gutom ako.', 'language' => 'fil'])
            ->assertOk()
            ->assertJsonPath('success', true)
            ->json('data.audio_path');

        $this->get($audioPath)->assertOk()->assertHeader('Content-Type', 'audio/mpeg');
        Http::assertSent(fn ($request): bool => $request->url() === 'https://api.giggy.ai/v1/text-to-speech'
            && $request['voice_id'] === 'voice-fil'
            && $request['text'] === 'Gutom ako.');
    }

    public function test_speech_rejects_unsupported_languages(): void
    {
        $this->postJson('/api/v1/speech', ['text' => 'Hello', 'language' => 'en'])
            ->assertUnprocessable();
    }
}
