<?php

namespace Database\Seeders;

use App\Models\ApplicationSetting;
use Illuminate\Database\Seeder;

class ApplicationSettingSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        foreach ([
            [
                'setting_key' => 'default_language',
                'setting_value' => ['code' => 'en'],
                'description' => 'Default language for new devices and unspecified language filters.',
                'is_public' => true,
            ],
            [
                'setting_key' => 'supported_languages',
                'setting_value' => ['codes' => ['en', 'fil', 'ceb']],
                'description' => 'Languages available in the communication content catalog.',
                'is_public' => true,
            ],
            [
                'setting_key' => 'offline_first',
                'setting_value' => ['enabled' => true],
                'description' => 'Core communication content should remain available offline on the device.',
                'is_public' => true,
            ],
        ] as $setting) {
            ApplicationSetting::query()->updateOrCreate(
                ['setting_key' => $setting['setting_key']],
                $setting,
            );
        }
    }
}
