<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\ListTranslationsRequest;
use App\Http\Resources\TranslationResource;
use App\Models\Language;
use App\Models\Translation;
use App\Support\ApiResponse;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;

class TranslationController extends Controller
{
    public function index(ListTranslationsRequest $request): JsonResponse
    {
        return $this->listing($request, $request->validated('language'));
    }

    public function byLanguage(ListTranslationsRequest $request, string $languageCode): JsonResponse
    {
        Language::query()
            ->where('code', $languageCode)
            ->where('is_active', true)
            ->firstOrFail();

        return $this->listing($request, $languageCode);
    }

    private function listing(ListTranslationsRequest $request, ?string $languageCode): JsonResponse
    {
        $query = Translation::query()
            ->whereHas('message', fn (Builder $messageQuery): Builder => $messageQuery->public())
            ->whereHas('language', function (Builder $languageQuery) use ($languageCode): void {
                $languageQuery->where('is_active', true);

                if ($languageCode !== null) {
                    $languageQuery->where('code', $languageCode);
                }
            })
            ->with(['language', 'message'])
            ->orderBy('message_id')
            ->orderBy('language_id');

        $paginator = $query->paginate($request->integer('per_page', 50));

        return ApiResponse::success(
            'Translations retrieved successfully.',
            TranslationResource::collection($paginator->getCollection())->resolve($request),
            [
                'language' => $languageCode,
                'current_page' => $paginator->currentPage(),
                'per_page' => $paginator->perPage(),
                'last_page' => $paginator->lastPage(),
                'total' => $paginator->total(),
            ],
        );
    }
}
