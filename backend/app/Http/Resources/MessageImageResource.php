<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class MessageImageResource extends JsonResource
{
    /**
     * Transform the resource into an array.
     *
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'image_path' => $this->image_path,
            'message_uuid' => $this->whenLoaded('message', fn (): ?string => $this->message?->uuid),
            'alt_text' => $this->alt_text,
            'image_type' => $this->image_type,
            'sort_order' => $this->sort_order,
            'updated_at' => $this->updated_at?->toISOString(),
        ];
    }
}
