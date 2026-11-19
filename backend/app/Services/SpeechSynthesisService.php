<?php

namespace App\Services;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use RuntimeException;

class SpeechSynthesisService
{
    /** @var array<string, string> */
    private const LANGUAGE_NAMES = ['fil' => 'Filipino'];

    public function isConfigured(): bool
    {
        $apiKey = config('communication.giggy_api_key');

        return is_string($apiKey) && $apiKey !== '';
    }

    /**
     * @return list<string>
     */
    public function supportedLanguages(): array
    {
        return array_keys(self::LANGUAGE_NAMES);
    }

    /**
     * Generate MP3 audio for the text and return its raw bytes.
     */
    public function synthesize(string $text, string $languageCode): string
    {
        $apiKey = (string) config('communication.giggy_api_key');
        $languageName = self::LANGUAGE_NAMES[$languageCode]
            ?? throw new RuntimeException("Unsupported speech language [{$languageCode}].");

        $voiceId = Cache::rememberForever("speech.voice.{$languageCode}", function () use ($apiKey, $languageName): string {
            $voicesResponse = Http::withHeaders(['xi-api-key' => $apiKey])
                ->acceptJson()
                ->connectTimeout(10)
                ->timeout(20)
                ->get('https://api.giggy.ai/v1/voices', [
                    'language' => $languageName,
                    'limit' => 1,
                ]);

            $voicesResponse->throw();
            $voiceId = $voicesResponse->json('voices.0.voice_id');

            if (! is_string($voiceId) || $voiceId === '') {
                throw new RuntimeException('No voice is available for the selected language.');
            }

            return $voiceId;
        });

        $speechResponse = Http::withHeaders(['xi-api-key' => $apiKey])
            ->accept('audio/mpeg')
            ->connectTimeout(10)
            ->timeout(120)
            ->post('https://api.giggy.ai/v1/text-to-speech', [
                'text' => $text,
                'voice_id' => $voiceId,
                'model_id' => 'giggyspeech',
                'mode' => 'batch',
                'output_format' => 'mp3_24000_160',
                'privacy' => ['content_retention_12h' => true],
            ]);

        $speechResponse->throw();

        if (! str_starts_with((string) $speechResponse->header('Content-Type'), 'audio/')) {
            throw new RuntimeException('The speech service returned an invalid audio response.');
        }

        return $speechResponse->body();
    }
}
