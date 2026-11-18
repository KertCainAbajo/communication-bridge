<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class SyncMessageResource extends JsonResource
{
    /**
     * Transform the resource into an array.
     *
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'uuid' => $this->uuid,
            'slug' => $this->slug,
            'category_id' => $this->category_id,
            'icon' => $this->icon,
            'image_path' => $this->image_path,
            'sort_order' => $this->sort_order,
            'is_featured' => $this->is_featured,
            'is_emergency' => $this->is_emergency,
            'is_active' => $this->is_active,
            'updated_at' => $this->updated_at?->toISOString(),
        ];
    }
}
