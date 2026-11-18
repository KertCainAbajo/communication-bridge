<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\ListCategoriesRequest;
use App\Http\Requests\Api\V1\ListCategoryMessagesRequest;
use App\Http\Resources\CategoryResource;
use App\Http\Resources\MessageResource;
use App\Models\Category;
use App\Models\Message;
use App\Support\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CategoryController extends Controller
{
    public function index(ListCategoriesRequest $request): JsonResponse
    {
        $language = $request->validated('language', config('communication.default_language', 'en'));
        $categories = Category::query()
            ->where('is_active', true)
            ->withCount(['messages' => fn ($query) => $query->where('is_active', true)])
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get();

        return ApiResponse::success(
            'Categories retrieved successfully.',
            CategoryResource::collection($categories)->resolve($request),
            ['language' => $language],
        );
    }

    public function show(Request $request, string $slug): JsonResponse
    {
        $category = Category::query()
            ->where('slug', $slug)
            ->where('is_active', true)
            ->withCount(['messages' => fn ($query) => $query->where('is_active', true)])
            ->firstOrFail();

        return ApiResponse::success(
            'Category retrieved successfully.',
            CategoryResource::make($category)->resolve($request),
        );
    }

    public function messages(ListCategoryMessagesRequest $request, string $slug): JsonResponse
    {
        $category = Category::query()
            ->where('slug', $slug)
            ->where('is_active', true)
            ->firstOrFail();
        $language = $request->validated('language', config('communication.default_language', 'en'));
        $paginator = Message::query()
            ->public()
            ->forLanguage($language)
            ->where('category_id', $category->id)
            ->orderBy('sort_order')
            ->orderBy('id')
            ->paginate($request->integer('per_page', 25));

        return ApiResponse::success(
            'Category messages retrieved successfully.',
            MessageResource::collection($paginator->getCollection())->resolve($request),
            [
                'category' => $category->slug,
                'language' => $language,
                'current_page' => $paginator->currentPage(),
                'per_page' => $paginator->perPage(),
                'last_page' => $paginator->lastPage(),
                'total' => $paginator->total(),
            ],
        );
    }
}
