<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\ApplicationSettingResource;
use App\Models\ApplicationSetting;
use App\Support\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ApplicationSettingController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $settings = ApplicationSetting::query()
            ->where('is_public', true)
            ->orderBy('setting_key')
            ->get();

        return ApiResponse::success(
            'Application settings retrieved successfully.',
            ApplicationSettingResource::collection($settings)->resolve($request),
        );
    }
}
