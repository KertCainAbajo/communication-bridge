<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class DatabaseSeeder extends Seeder
{
    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        DB::transaction(function (): void {
            $this->call([
                LanguageSeeder::class,
                CategorySeeder::class,
                MessageSeeder::class,
                TranslationSeeder::class,
                ApplicationSettingSeeder::class,
            ]);
        });
    }
}
