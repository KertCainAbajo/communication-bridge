<?php

namespace App\Services;

use App\Http\Resources\CategoryResource;
use App\Http\Resources\LanguageResource;
use App\Http\Resources\MessageAudioResource;
use App\Http\Resources\MessageImageResource;
use App\Http\Resources\SyncMessageResource;
use App\Http\Resources\TranslationResource;
use App\Models\Category;
use App\Models\Language;
use App\Models\Message;
use App\Models\MessageAudio;
use App\Models\MessageImage;
use App\Models\Translation;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class CommunicationSyncService
{
    /**
     * @return array{
     *     data: array<string, array<mixed>>,
     *     meta: array<string, mixed>
     * }
     */
    public function snapshot(?CarbonImmutable $since, Request $request): array
    {
        $languages = $this->activeOrChanged(Language::query(), $since)
            ->orderBy('code')
            ->get();

        $categories = $this->activeOrChanged(Category::query(), $since)
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get();

        $messagesQuery = Message::query();
        if ($since === null) {
            $messagesQuery->public();
        } else {
            $messagesQuery->where('updated_at', '>', $since);
        }

        $messages = $messagesQuery
            ->orderBy('id')
            ->get();

        $translationsQuery = Translation::query()
            ->with(['language', 'message']);
        if ($since === null) {
            $translationsQuery
                ->whereHas('message', fn (Builder $query): Builder => $query->public())
                ->whereHas('language', fn (Builder $query): Builder => $query->where('is_active', true));
        } else {
            $translationsQuery->where('updated_at', '>', $since);
        }

        $translations = $translationsQuery
            ->orderBy('message_id')
            ->orderBy('language_id')
            ->get();

        $imagesQuery = MessageImage::query()->with('message');
        if ($since === null) {
            $imagesQuery->whereHas('message', fn (Builder $query): Builder => $query->public());
        } else {
            $imagesQuery->where('updated_at', '>', $since);
        }

        $images = $imagesQuery
            ->orderBy('message_id')
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get();

        $audioQuery = MessageAudio::query()->with(['language', 'message']);
        if ($since === null) {
            $audioQuery
                ->where('is_active', true)
                ->whereHas('message', fn (Builder $query): Builder => $query->public())
                ->whereHas('language', fn (Builder $query): Builder => $query->where('is_active', true));
        } else {
            $audioQuery->where('updated_at', '>', $since);
        }

        $audio = $audioQuery
            ->orderBy('message_id')
            ->orderBy('language_id')
            ->get();

        $version = $this->contentVersion();

        return [
            'data' => [
                'languages' => LanguageResource::collection($languages)->resolve($request),
                'categories' => CategoryResource::collection($categories)->resolve($request),
                'messages' => SyncMessageResource::collection($messages)->resolve($request),
                'translations' => TranslationResource::collection($translations)->resolve($request),
                'images' => MessageImageResource::collection($images)->resolve($request),
                'audio' => MessageAudioResource::collection($audio)->resolve($request),
            ],
            'meta' => [
                'content_version' => $version,
                'generated_at' => now()->toISOString(),
                'incremental' => $since !== null,
                'since' => $since?->toISOString(),
            ],
        ];
    }

    private function activeOrChanged(Builder $query, ?CarbonImmutable $since): Builder
    {
        return $since === null
            ? $query->where('is_active', true)
            : $query->where('updated_at', '>', $since);
    }

    private function contentVersion(): string
    {
        $latestTimestamp = collect([
            'categories',
            'languages',
            'messages',
            'translations',
            'message_audio',
            'message_images',
        ])
            ->map(fn (string $table): ?string => DB::table($table)->max('updated_at'))
            ->filter()
            ->max();

        return CarbonImmutable::parse($latestTimestamp ?? now())->utc()->toISOString();
    }
}
