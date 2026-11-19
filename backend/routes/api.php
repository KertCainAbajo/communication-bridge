<?php

use App\Http\Controllers\Api\V1\ApplicationSettingController;
use App\Http\Controllers\Api\V1\CategoryController;
use App\Http\Controllers\Api\V1\HealthController;
use App\Http\Controllers\Api\V1\LanguageController;
use App\Http\Controllers\Api\V1\MessageController;
use App\Http\Controllers\Api\V1\SpeechController;
use App\Http\Controllers\Api\V1\SyncController;
use App\Http\Controllers\Api\V1\TranslationController;
use Illuminate\Support\Facades\Route;

Route::get('/health', function () {
    return response()->json([
        'status' => 'ok',
        'message' => 'Laravel API is reachable.',
    ]);
})->name('api.health.legacy');

Route::prefix('v1')->name('api.v1.')->group(function (): void {
    Route::get('/health', HealthController::class)->name('health');

    Route::post('/speech', [SpeechController::class, 'synthesize'])
        ->middleware('throttle:speech')
        ->name('speech.synthesize');
    Route::get('/speech/audio/{token}', [SpeechController::class, 'audio'])
        ->whereUuid('token')
        ->middleware('signed:relative')
        ->name('speech.audio');

    Route::get('/sync', SyncController::class)->name('sync');

    Route::get('/categories', [CategoryController::class, 'index'])->name('categories.index');
    Route::get('/categories/{slug}/messages', [CategoryController::class, 'messages'])->name('categories.messages');
    Route::get('/categories/{slug}', [CategoryController::class, 'show'])->name('categories.show');

    Route::get('/messages', [MessageController::class, 'index'])->name('messages.index');
    Route::get('/messages/featured', [MessageController::class, 'featured'])->name('messages.featured');
    Route::get('/messages/emergency', [MessageController::class, 'emergency'])->name('messages.emergency');
    Route::get('/messages/{uuid}', [MessageController::class, 'show'])
        ->whereUuid('uuid')
        ->name('messages.show');

    Route::get('/languages', [LanguageController::class, 'index'])->name('languages.index');
    Route::get('/languages/{code}', [LanguageController::class, 'show'])->name('languages.show');

    Route::get('/translations', [TranslationController::class, 'index'])->name('translations.index');
    Route::get('/translations/{languageCode}', [TranslationController::class, 'byLanguage'])->name('translations.language');

    Route::get('/application-settings', [ApplicationSettingController::class, 'index'])->name('application-settings.index');
});
