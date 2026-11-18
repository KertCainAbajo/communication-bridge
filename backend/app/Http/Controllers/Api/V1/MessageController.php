<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\ListMessagesRequest;
use App\Http\Resources\MessageResource;
use App\Models\Message;
use App\Support\ApiResponse;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class MessageController extends Controller
{
    public function index(ListMessagesRequest $request): JsonResponse
    {
        return $this->listing($request);
    }

    public function featured(ListMessagesRequest $request): JsonResponse
    {
        return $this->listing($request, 'is_featured');
    }

    public function emergency(ListMessagesRequest $request): JsonResponse
    {
        return $this->listing($request, 'is_emergency');
    }

    public function show(Request $request, string $uuid): JsonResponse
    {
        $validated = $request->validate([
            'language' => ['sometimes', 'string', 'max:3', Rule::exists('languages', 'code')->where('is_active', true)],
        ]);
        $language = $validated['language'] ?? config('communication.default_language', 'en');

        $message = Message::query()
            ->public()
            ->forLanguage($language)
            ->where('uuid', $uuid)
            ->firstOrFail();

        return ApiResponse::success(
            'Message retrieved successfully.',
            MessageResource::make($message)->resolve($request),
            ['language' => $language],
        );
    }

    private function listing(ListMessagesRequest $request, ?string $requiredFlag = null): JsonResponse
    {
        $filters = $request->validated();
        $language = $filters['language'] ?? config('communication.default_language', 'en');
        $query = Message::query()
            ->public()
            ->forLanguage($language);

        if (isset($filters['category'])) {
            $query->whereHas('category', fn (Builder $categoryQuery): Builder => $categoryQuery->where('slug', $filters['category']));
        }

        foreach (['is_featured', 'is_emergency'] as $flag) {
            if ($requiredFlag === $flag) {
                $query->where($flag, true);
            } elseif (array_key_exists($flag, $filters)) {
                $query->where($flag, $request->boolean($flag));
            }
        }

        $paginator = $query
            ->orderBy('sort_order')
            ->orderBy('id')
            ->paginate($request->integer('per_page', 25));

        $message = match ($requiredFlag) {
            'is_featured' => 'Featured messages retrieved successfully.',
            'is_emergency' => 'Emergency messages retrieved successfully.',
            default => 'Messages retrieved successfully.',
        };

        return ApiResponse::success(
            $message,
            MessageResource::collection($paginator->getCollection())->resolve($request),
            [
                'language' => $language,
                'category' => $filters['category'] ?? null,
                'current_page' => $paginator->currentPage(),
                'per_page' => $paginator->perPage(),
                'last_page' => $paginator->lastPage(),
                'total' => $paginator->total(),
            ],
        );
    }
}
