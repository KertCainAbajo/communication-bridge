<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;

class Message extends Model
{
    protected $fillable = [
        'category_id',
        'slug',
        'icon',
        'image_path',
        'sort_order',
        'is_featured',
        'is_emergency',
        'is_active',
    ];

    protected static function booted(): void
    {
        static::creating(function (Message $message): void {
            $message->uuid ??= (string) Str::uuid();
        });
    }

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
            'is_emergency' => 'boolean',
            'is_featured' => 'boolean',
            'sort_order' => 'integer',
        ];
    }

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('is_active', true);
    }

    public function scopePublic(Builder $query): Builder
    {
        return $query->active()->whereHas('category', function (Builder $categoryQuery): void {
            $categoryQuery->where('is_active', true);
        });
    }

    public function scopeForLanguage(Builder $query, string $languageCode): Builder
    {
        return $query->with([
            'category',
            'translations' => function (HasMany $translationQuery) use ($languageCode): void {
                $translationQuery->whereHas('language', function (Builder $languageQuery) use ($languageCode): void {
                    $languageQuery->where('code', $languageCode)->where('is_active', true);
                });
            },
            'translations.language',
            'images',
            'audio' => function (HasMany $audioQuery) use ($languageCode): void {
                $audioQuery->where('is_active', true)
                    ->whereHas('language', function (Builder $languageQuery) use ($languageCode): void {
                        $languageQuery->where('code', $languageCode)->where('is_active', true);
                    });
            },
            'audio.language',
        ]);
    }

    public function category(): BelongsTo
    {
        return $this->belongsTo(Category::class);
    }

    public function translations(): HasMany
    {
        return $this->hasMany(Translation::class);
    }

    public function audio(): HasMany
    {
        return $this->hasMany(MessageAudio::class);
    }

    public function images(): HasMany
    {
        return $this->hasMany(MessageImage::class)->orderBy('sort_order')->orderBy('id');
    }
}
