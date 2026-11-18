<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class MessageResource extends JsonResource
{
    /**
     * Transform the resource into an array.
     *
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $translation = $this->translations->first();

        return [
            'uuid' => $this->uuid,
            'slug' => $this->slug,
            'category' => CategoryResource::make($this->whenLoaded('category')),
            'icon' => $this->icon,
            'image_path' => $this->image_path,
            'sort_order' => $this->sort_order,
            'is_featured' => $this->is_featured,
            'is_emergency' => $this->is_emergency,
            'title' => $translation?->title,
            'message_text' => $translation?->message_text,
            'translation' => $translation === null ? null : TranslationResource::make($translation),
            'images' => MessageImageResource::collection($this->whenLoaded('images')),
            'audio' => MessageAudioResource::collection($this->whenLoaded('audio')),
        ];
    }
}
