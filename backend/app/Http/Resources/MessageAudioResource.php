<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class MessageAudioResource extends JsonResource
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
            'message_uuid' => $this->whenLoaded('message', fn (): ?string => $this->message?->uuid),
            'audio_path' => $this->audio_path,
            'audio_format' => $this->audio_format,
            'duration' => $this->duration,
            'is_active' => $this->is_active,
            'updated_at' => $this->updated_at?->toISOString(),
        ];
    }
}
