<?php

namespace Database\Seeders;

use App\Models\Category;
use App\Models\Message;
use Illuminate\Database\Seeder;
use RuntimeException;

class MessageSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        foreach (CommunicationContent::messages() as $message) {
            $categoryId = Category::query()
                ->where('slug', $message['category'])
                ->value('id');

            if ($categoryId === null) {
                throw new RuntimeException("The category [{$message['category']}] is missing.");
            }

            Message::query()->updateOrCreate(
                ['slug' => $message['slug']],
                [
                    'category_id' => $categoryId,
                    'icon' => $message['icon'],
                    'image_path' => null,
                    'sort_order' => $message['sort_order'],
                    'is_featured' => $message['is_featured'],
                    'is_emergency' => $message['is_emergency'],
                    'is_active' => true,
                ],
            );
        }
    }
}
