<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MessageAudio extends Model
{
    protected $table = 'message_audio';

    protected $fillable = [
        'message_id',
        'language_id',
        'audio_path',
        'audio_format',
        'duration',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'duration' => 'integer',
            'is_active' => 'boolean',
        ];
    }

    public function message(): BelongsTo
    {
        return $this->belongsTo(Message::class);
    }

    public function language(): BelongsTo
    {
        return $this->belongsTo(Language::class);
    }
}
