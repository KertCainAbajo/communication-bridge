<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\SpeechSynthesisService;
use App\Support\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\URL;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Throwable;

class SpeechController extends Controller
{
    public function synthesize(Request $request, SpeechSynthesisService $speech): JsonResponse
    {
        $validated = $request->validate([
            'text' => ['required', 'string', 'max:1000'],
            'language' => ['required', 'string', Rule::in($speech->supportedLanguages())],
        ]);

        if (! $speech->isConfigured()) {
            return ApiResponse::failure(
                'Online speech is not configured on this Laravel server yet. Add GIGGY_API_KEY to backend/.env.',
                [],
                503,
            );
        }

        try {
            $audio = $speech->synthesize($validated['text'], $validated['language']);

            foreach (Storage::disk('local')->files('speech') as $oldAudioFile) {
                if (Storage::disk('local')->lastModified($oldAudioFile) < now()->subMinutes(15)->timestamp) {
                    Storage::disk('local')->delete($oldAudioFile);
                }
            }

            $token = (string) str()->uuid();
            Storage::disk('local')->put("speech/{$token}.mp3", $audio);
            $audioPath = URL::temporarySignedRoute(
                'api.v1.speech.audio',
                now()->addMinutes(15),
                ['token' => $token],
                absolute: false,
            );

            return ApiResponse::success('Speech generated successfully.', [
                'audio_path' => $audioPath,
            ]);
        } catch (Throwable) {
            return ApiResponse::failure(
                'Online speech could not be generated right now. Please try again in a moment.',
                [],
                502,
            );
        }
    }

    public function audio(string $token): StreamedResponse|JsonResponse
    {
        $path = "speech/{$token}.mp3";
        if (! Storage::disk('local')->exists($path)) {
            return ApiResponse::failure('This audio has expired. Generate it again to listen.', [], 404);
        }

        return Storage::disk('local')->response($path, "{$token}.mp3", [
            'Content-Type' => 'audio/mpeg',
            'Content-Disposition' => "inline; filename=\"{$token}.mp3\"",
            'Cache-Control' => 'private, max-age=300',
        ]);
    }
}
