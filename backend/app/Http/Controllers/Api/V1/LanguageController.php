<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\LanguageResource;
use App\Models\Language;
use App\Support\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class LanguageController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $languages = Language::query()
            ->where('is_active', true)
            ->orderBy('code')
            ->get();

        return ApiResponse::success(
            'Languages retrieved successfully.',
            LanguageResource::collection($languages)->resolve($request),
        );
    }

    public function show(Request $request, string $code): JsonResponse
    {
        $language = Language::query()
            ->where('code', $code)
            ->where('is_active', true)
            ->firstOrFail();

        return ApiResponse::success(
            'Language retrieved successfully.',
            LanguageResource::make($language)->resolve($request),
        );
    }
}
