<?php

namespace Database\Seeders;

use App\Models\Language;
use App\Models\Message;
use App\Models\Translation;
use Illuminate\Database\Seeder;
use RuntimeException;

class TranslationSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        $languageIds = Language::query()->pluck('id', 'code');

        foreach (CommunicationContent::messages() as $messageData) {
            $messageId = Message::query()
                ->where('slug', $messageData['slug'])
                ->value('id');

            if ($messageId === null) {
                throw new RuntimeException("The message [{$messageData['slug']}] is missing.");
            }

            foreach (['en', 'fil', 'ceb'] as $languageCode) {
                if (! $languageIds->has($languageCode)) {
                    throw new RuntimeException("The language [{$languageCode}] is missing.");
                }

                [$title, $messageText] = $messageData[$languageCode];

                Translation::query()->updateOrCreate(
                    [
                        'message_id' => $messageId,
                        'language_id' => $languageIds->get($languageCode),
                    ],
                    [
                        'title' => $title,
                        'message_text' => $messageText,
                    ],
                );
            }
        }
    }
}
