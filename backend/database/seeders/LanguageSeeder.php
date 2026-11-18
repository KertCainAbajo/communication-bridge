<?php

namespace Database\Seeders;

use App\Models\Language;
use Illuminate\Database\Seeder;

class LanguageSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        foreach ([
            ['code' => 'en', 'name' => 'English', 'native_name' => 'English', 'is_active' => true],
            ['code' => 'fil', 'name' => 'Filipino', 'native_name' => 'Filipino', 'is_active' => true],
            ['code' => 'ceb', 'name' => 'Bisaya (Cebuano)', 'native_name' => 'Binisaya', 'is_active' => true],
        ] as $language) {
            Language::query()->updateOrCreate(
                ['code' => $language['code']],
                $language,
            );
        }
    }
}
