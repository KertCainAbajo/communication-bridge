<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ApplicationSetting extends Model
{
    protected $fillable = [
        'setting_key',
        'setting_value',
        'description',
        'is_public',
    ];

    protected function casts(): array
    {
        return [
            'setting_value' => 'array',
            'is_public' => 'boolean',
        ];
    }
}
