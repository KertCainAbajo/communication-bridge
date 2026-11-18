<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class TranslationResource extends JsonResource
{
    /**
     * Transform the resource into an array.
     *
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'language' => $this->language?->code,
            'message' => $this->whenLoaded('message', fn (): array => [
                'uuid' => $this->message->uuid,
                'slug' => $this->message->slug,
            ]),
            'title' => $this->title,
            'message_text' => $this->message_text,
            'updated_at' => $this->updated_at?->toISOString(),
        ];
    }
}
